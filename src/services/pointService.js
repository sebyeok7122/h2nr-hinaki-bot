const {
  db
} = require('../database/db');


const ensureUser = db.prepare(`
  INSERT INTO users (
    guild_id,
    user_id,
    points
  )
  VALUES (?, ?, 0)

  ON CONFLICT (
    guild_id,
    user_id
  )
  DO NOTHING
`);


const selectUser = db.prepare(`
  SELECT *
  FROM users
  WHERE
    guild_id = ?
    AND user_id = ?
`);


const updatePoints = db.prepare(`
  UPDATE users
  SET
    points = ?,
    updated_at = datetime('now')
  WHERE
    guild_id = ?
    AND user_id = ?
`);


const insertTransaction = db.prepare(`
  INSERT INTO point_transactions (
    guild_id,
    user_id,
    amount,
    balance_after,
    source,
    description,
    reference_type,
    reference_id,
    created_by
  )
  VALUES (
    @guildId,
    @userId,
    @amount,
    @balanceAfter,
    @source,
    @description,
    @referenceType,
    @referenceId,
    @createdBy
  )
`);


const selectRecentTransactions =
  db.prepare(`
    SELECT *
    FROM point_transactions
    WHERE
      guild_id = ?
      AND user_id = ?
    ORDER BY id DESC
    LIMIT ?
  `);


const changePointsTransaction =
  db.transaction((data) => {
    ensureUser.run(
      data.guildId,
      data.userId
    );


    const user =
      selectUser.get(
        data.guildId,
        data.userId
      );


    const balanceBefore =
      user?.points || 0;


    const balanceAfter =
      balanceBefore +
      data.amount;


    if (
      balanceAfter < 0
    ) {
      return {
        code:
          'INSUFFICIENT_POINTS',

        balanceBefore,
        balanceAfter:
          balanceBefore,

        requestedAmount:
          data.amount,
      };
    }


    updatePoints.run(
      balanceAfter,
      data.guildId,
      data.userId
    );


    const result =
      insertTransaction.run({
        guildId:
          data.guildId,

        userId:
          data.userId,

        amount:
          data.amount,

        balanceAfter,

        source:
          data.source,

        description:
          data.description || null,

        referenceType:
          data.referenceType || null,

        referenceId:
          data.referenceId || null,

        createdBy:
          data.createdBy || null,
      });


    return {
      code:
        'OK',

      transactionId:
        Number(
          result.lastInsertRowid
        ),

      amount:
        data.amount,

      balanceBefore,
      balanceAfter,
    };
  });


function getPointBalance(
  guildId,
  userId
) {
  ensureUser.run(
    guildId,
    userId
  );


  const user =
    selectUser.get(
      guildId,
      userId
    );


  return user?.points || 0;
}


function changePoints(data) {
  if (
    !Number.isInteger(
      data.amount
    ) ||
    data.amount === 0
  ) {
    throw new Error(
      '포인트 변경량은 0이 아닌 정수여야 합니다.'
    );
  }


  if (
    !data.guildId ||
    !data.userId ||
    !data.source
  ) {
    throw new Error(
      '포인트 처리에 필요한 정보가 부족합니다.'
    );
  }


  return changePointsTransaction(
    data
  );
}


function addPoints({
  guildId,
  userId,
  amount,
  source,
  description = null,
  referenceType = null,
  referenceId = null,
  createdBy = null,
}) {
  if (
    !Number.isInteger(amount) ||
    amount <= 0
  ) {
    throw new Error(
      '지급 포인트는 1 이상의 정수여야 합니다.'
    );
  }


  return changePoints({
    guildId,
    userId,
    amount,
    source,
    description,
    referenceType,
    referenceId,
    createdBy,
  });
}


function deductPoints({
  guildId,
  userId,
  amount,
  source,
  description = null,
  referenceType = null,
  referenceId = null,
  createdBy = null,
}) {
  if (
    !Number.isInteger(amount) ||
    amount <= 0
  ) {
    throw new Error(
      '차감 포인트는 1 이상의 정수여야 합니다.'
    );
  }


  return changePoints({
    guildId,
    userId,
    amount:
      -amount,

    source,
    description,
    referenceType,
    referenceId,
    createdBy,
  });
}


function getRecentPointTransactions(
  guildId,
  userId,
  limit = 10
) {
  const safeLimit =
    Math.min(
      Math.max(
        Number(limit) || 10,
        1
      ),
      50
    );


  return selectRecentTransactions.all(
    guildId,
    userId,
    safeLimit
  );
}


module.exports = {
  getPointBalance,
  changePoints,
  addPoints,
  deductPoints,
  getRecentPointTransactions,
};