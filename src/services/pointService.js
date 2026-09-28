const {
  db
} = require('../database/db');

const {
  ROLE_IDS,
  RECRUIT_CONFIG
} = require('../config/constants');


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


/*
 * 신입 → 멤버 승급 기록 확인
 */
const selectPromotion =
  db.prepare(`
    SELECT *
    FROM user_promotions
    WHERE
      guild_id = ?
      AND user_id = ?
      AND promotion_type = 'NEWBIE_TO_MEMBER'
  `);


/*
 * 한 번 승급한 사람은
 * 다시 중복 기록되지 않습니다.
 */
const insertPromotion =
  db.prepare(`
    INSERT OR IGNORE INTO user_promotions (
      guild_id,
      user_id,
      promotion_type,
      from_role_id,
      to_role_id,
      threshold_points
    )
    VALUES (
      ?,
      ?,
      'NEWBIE_TO_MEMBER',
      ?,
      ?,
      ?
    )
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


/*
 * 10P 이상이 된 신입을
 * 멤버로 자동 승급합니다.
 *
 * 포인트가 나중에 줄어들더라도
 * 강등시키지 않습니다.
 */
async function promoteNewbieIfEligible(
  guild,
  userId
) {
  const balance =
    getPointBalance(
      guild.id,
      userId
    );


  if (
    balance <
    RECRUIT_CONFIG.NEWBIE_PROMOTION_POINTS
  ) {
    return {
      code:
        'NOT_ELIGIBLE',

      balance,
    };
  }


  /*
   * 과거에 이미 자동승급이 완료된 사람
   */
  const existingPromotion =
    selectPromotion.get(
      guild.id,
      userId
    );


  if (
    existingPromotion
  ) {
    return {
      code:
        'ALREADY_PROMOTED',

      balance,
    };
  }


  let member;


  try {
    member =
      guild.members.cache.get(
        userId
      ) ||
      await guild.members.fetch(
        userId
      );

  } catch (error) {
    return {
      code:
        'MEMBER_NOT_FOUND',

      balance,
      error,
    };
  }


  /*
   * 현재 신입 역할을 가진 사람만
   * 자동등업 대상입니다.
   */
  if (
    !member.roles.cache.has(
      ROLE_IDS.NEWBIE
    )
  ) {
    return {
      code:
        'NOT_NEWBIE',

      balance,
    };
  }


  try {
    /*
     * 혹시 역할 처리 중 문제가 생겨도
     * 멤버 권한이 먼저 확보되도록
     * 멤버 역할부터 지급합니다.
     */
    if (
      !member.roles.cache.has(
        ROLE_IDS.MEMBER
      )
    ) {
      await member.roles.add(
        ROLE_IDS.MEMBER,
        '희낙이 포인트 10P 자동등업'
      );
    }


    /*
     * 멤버 역할 지급 성공 후
     * 신입 역할을 제거합니다.
     */
    await member.roles.remove(
      ROLE_IDS.NEWBIE,
      '희낙이 포인트 10P 자동등업'
    );

  } catch (error) {
    return {
      code:
        'ROLE_UPDATE_FAILED',

      balance,
      error,
    };
  }


  insertPromotion.run(
    guild.id,
    userId,
    ROLE_IDS.NEWBIE,
    ROLE_IDS.MEMBER,
    RECRUIT_CONFIG.NEWBIE_PROMOTION_POINTS
  );


  return {
    code:
      'PROMOTED',

    balance,

    threshold:
      RECRUIT_CONFIG.NEWBIE_PROMOTION_POINTS,
  };
}


module.exports = {
  getPointBalance,

  changePoints,
  addPoints,
  deductPoints,

  getRecentPointTransactions,

  promoteNewbieIfEligible,
};