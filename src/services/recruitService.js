const {
  db
} = require('../database/db');


const selectRecruitment = db.prepare(`
  SELECT *
  FROM recruitments
  WHERE id = ?
`);


const selectActiveMembers = db.prepare(`
  SELECT user_id
  FROM recruitment_members
  WHERE
    recruitment_id = ?
    AND is_active = 1
  ORDER BY joined_at ASC
`);


const countActiveMembers = db.prepare(`
  SELECT COUNT(*) AS count
  FROM recruitment_members
  WHERE
    recruitment_id = ?
    AND is_active = 1
`);


const selectActiveMember = db.prepare(`
  SELECT user_id
  FROM recruitment_members
  WHERE
    recruitment_id = ?
    AND user_id = ?
    AND is_active = 1
`);


const insertRecruitment = db.prepare(`
  INSERT INTO recruitments (
    guild_id,
    channel_id,
    type,
    creator_id,
    voice_kind,
    voice_room_number,
    capacity,
    start_time,
    status
  )
  VALUES (
    @guildId,
    @channelId,
    @type,
    @creatorId,
    @voiceKind,
    @voiceRoomNumber,
    @capacity,
    @startTime,
    @status
  )
`);


const upsertMember = db.prepare(`
  INSERT INTO recruitment_members (
    recruitment_id,
    user_id,
    is_active,
    joined_at,
    left_at
  )
  VALUES (
    ?,
    ?,
    1,
    datetime('now'),
    NULL
  )

  ON CONFLICT (
    recruitment_id,
    user_id
  )
  DO UPDATE SET
    is_active = 1,
    joined_at = datetime('now'),
    left_at = NULL
`);


const deactivateMember = db.prepare(`
  UPDATE recruitment_members
  SET
    is_active = 0,
    left_at = datetime('now')
  WHERE
    recruitment_id = ?
    AND user_id = ?
    AND is_active = 1
`);


const updateRecruitmentStatus =
  db.prepare(`
    UPDATE recruitments
    SET
      status = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `);


const updateMessageId = db.prepare(`
  UPDATE recruitments
  SET
    message_id = ?,
    updated_at = datetime('now')
  WHERE id = ?
`);


const deleteRecruitmentStatement =
  db.prepare(`
    DELETE FROM recruitments
    WHERE id = ?
  `);


const selectActiveWatcher =
  db.prepare(`
    SELECT user_id
    FROM recruitment_watchers
    WHERE
      recruitment_id = ?
      AND user_id = ?
      AND is_active = 1
  `);


const upsertWatcher = db.prepare(`
  INSERT INTO recruitment_watchers (
    recruitment_id,
    user_id,
    is_active,
    created_at,
    notified_at
  )
  VALUES (
    ?,
    ?,
    1,
    datetime('now'),
    NULL
  )

  ON CONFLICT (
    recruitment_id,
    user_id
  )
  DO UPDATE SET
    is_active = 1,
    created_at = datetime('now'),
    notified_at = NULL
`);


const selectActiveWatchers =
  db.prepare(`
    SELECT user_id
    FROM recruitment_watchers
    WHERE
      recruitment_id = ?
      AND is_active = 1
  `);


const deactivateWatcher =
  db.prepare(`
    UPDATE recruitment_watchers
    SET
      is_active = 0,
      notified_at = datetime('now')
    WHERE
      recruitment_id = ?
      AND user_id = ?
  `);


function getRecruitmentSnapshot(
  recruitmentId
) {
  const recruitment =
    selectRecruitment.get(
      recruitmentId
    );

  if (!recruitment) {
    return null;
  }

  const memberIds =
    selectActiveMembers
      .all(recruitmentId)
      .map(
        (row) => row.user_id
      );

  const memberCount =
    memberIds.length;

  return {
    recruitment,
    memberIds,
    memberCount,

    remaining:
      Math.max(
        recruitment.capacity -
          memberCount,
        0
      ),

    isFull:
      memberCount >=
      recruitment.capacity,
  };
}


const createRecruitmentTransaction =
  db.transaction((data) => {
    const status =
      data.memberIds.length >=
      data.capacity
        ? 'FULL'
        : 'OPEN';

    const result =
      insertRecruitment.run({
        guildId: data.guildId,
        channelId: data.channelId,
        type: data.type,
        creatorId: data.creatorId,
        voiceKind: data.voiceKind,
        voiceRoomNumber:
          data.voiceRoomNumber,
        capacity: data.capacity,
        startTime: data.startTime,
        status,
      });

    const recruitmentId =
      Number(
        result.lastInsertRowid
      );

    for (
      const userId of data.memberIds
    ) {
      upsertMember.run(
        recruitmentId,
        userId
      );
    }

    return {
      id: recruitmentId,
      status,
    };
  });


const joinRecruitmentTransaction =
  db.transaction(
    (
      recruitmentId,
      userId
    ) => {
      const recruitment =
        selectRecruitment.get(
          recruitmentId
        );

      if (!recruitment) {
        return {
          code: 'NOT_FOUND',
        };
      }

      if (
        ![
          'OPEN',
          'FULL',
        ].includes(
          recruitment.status
        )
      ) {
        return {
          code: 'CLOSED',
        };
      }

      const alreadyMember =
        selectActiveMember.get(
          recruitmentId,
          userId
        );

      if (alreadyMember) {
        return {
          code:
            'ALREADY_JOINED',
        };
      }

      const currentCount =
        countActiveMembers.get(
          recruitmentId
        ).count;

      if (
        currentCount >=
        recruitment.capacity
      ) {
        updateRecruitmentStatus.run(
          'FULL',
          recruitmentId
        );

        return {
          code: 'FULL',
        };
      }

      upsertMember.run(
        recruitmentId,
        userId
      );

      const newCount =
        currentCount + 1;

      const newStatus =
        newCount >=
        recruitment.capacity
          ? 'FULL'
          : 'OPEN';

      updateRecruitmentStatus.run(
        newStatus,
        recruitmentId
      );

      return {
        code: 'JOINED',

        snapshot:
          getRecruitmentSnapshot(
            recruitmentId
          ),
      };
    }
  );


const cancelRecruitmentTransaction =
  db.transaction(
    (
      recruitmentId,
      userId
    ) => {
      const recruitment =
        selectRecruitment.get(
          recruitmentId
        );

      if (!recruitment) {
        return {
          code: 'NOT_FOUND',
        };
      }

      const activeMember =
        selectActiveMember.get(
          recruitmentId,
          userId
        );

      if (!activeMember) {
        return {
          code:
            'NOT_JOINED',
        };
      }

      const beforeCount =
        countActiveMembers.get(
          recruitmentId
        ).count;

      deactivateMember.run(
        recruitmentId,
        userId
      );

      const afterCount =
        Math.max(
          beforeCount - 1,
          0
        );

      const becameAvailable =
        beforeCount >=
          recruitment.capacity &&
        afterCount <
          recruitment.capacity;

      updateRecruitmentStatus.run(
        'OPEN',
        recruitmentId
      );

      return {
        code: 'CANCELLED',
        becameAvailable,

        snapshot:
          getRecruitmentSnapshot(
            recruitmentId
          ),
      };
    }
  );


function createRecruitment(data) {
  return createRecruitmentTransaction(
    data
  );
}


function joinRecruitment(
  recruitmentId,
  userId
) {
  return joinRecruitmentTransaction(
    recruitmentId,
    userId
  );
}


function cancelRecruitment(
  recruitmentId,
  userId
) {
  return cancelRecruitmentTransaction(
    recruitmentId,
    userId
  );
}


function addRecruitmentWatcher(
  recruitmentId,
  userId
) {
  const snapshot =
    getRecruitmentSnapshot(
      recruitmentId
    );

  if (!snapshot) {
    return {
      code: 'NOT_FOUND',
    };
  }

  if (
    snapshot.memberIds.includes(
      userId
    )
  ) {
    return {
      code:
        'ALREADY_JOINED',
    };
  }

  if (!snapshot.isFull) {
    return {
      code: 'NOT_FULL',
    };
  }

  const existing =
    selectActiveWatcher.get(
      recruitmentId,
      userId
    );

  if (existing) {
    return {
      code:
        'ALREADY_WATCHING',
    };
  }

  upsertWatcher.run(
    recruitmentId,
    userId
  );

  return {
    code: 'WATCHING',
  };
}


function getActiveWatchers(
  recruitmentId
) {
  return selectActiveWatchers
    .all(recruitmentId)
    .map(
      (row) => row.user_id
    );
}


function markWatchersNotified(
  recruitmentId,
  userIds
) {
  const transaction =
    db.transaction(() => {
      for (
        const userId of userIds
      ) {
        deactivateWatcher.run(
          recruitmentId,
          userId
        );
      }
    });

  transaction();
}


function setRecruitmentMessageId(
  recruitmentId,
  messageId
) {
  updateMessageId.run(
    messageId,
    recruitmentId
  );
}


function deleteRecruitment(
  recruitmentId
) {
  deleteRecruitmentStatement.run(
    recruitmentId
  );
}


module.exports = {
  createRecruitment,
  getRecruitmentSnapshot,
  joinRecruitment,
  cancelRecruitment,

  addRecruitmentWatcher,
  getActiveWatchers,
  markWatchersNotified,

  setRecruitmentMessageId,
  deleteRecruitment,
};