const { db } = require('../database/db');

const WAIT_PRIORITY_SECONDS = 180;


/*
 * 신입파티에서 어떤 멤버가 신입인지 저장합니다.
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS recruitment_newbies (
    recruitment_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    PRIMARY KEY (
      recruitment_id,
      user_id
    ),

    FOREIGN KEY (recruitment_id)
      REFERENCES recruitments(id)
      ON DELETE CASCADE
  );
`);


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


const selectNewbieMembers = db.prepare(`
  SELECT user_id
  FROM recruitment_newbies
  WHERE recruitment_id = ?
  ORDER BY created_at ASC
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
    game_name,
    description,
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
    @gameName,
    @description,
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


const insertNewbieMember = db.prepare(`
  INSERT OR IGNORE INTO recruitment_newbies (
    recruitment_id,
    user_id
  )
  VALUES (?, ?)
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


const updateRecruitmentStatus = db.prepare(`
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


const deleteRecruitmentStatement = db.prepare(`
  DELETE FROM recruitments
  WHERE id = ?
`);


/*
 * ─────────────────────────────
 * 자리알림 대기열
 * ─────────────────────────────
 */


const selectActiveWatcher = db.prepare(`
  SELECT
    user_id,
    created_at,
    notified_at

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
    strftime(
      '%Y-%m-%d %H:%M:%f',
      'now'
    ),
    NULL
  )

  ON CONFLICT (
    recruitment_id,
    user_id
  )
  DO UPDATE SET
    is_active = 1,
    created_at = strftime(
      '%Y-%m-%d %H:%M:%f',
      'now'
    ),
    notified_at = NULL
`);


const selectActiveWatchers = db.prepare(`
  SELECT
    user_id,
    created_at,
    notified_at,

    CASE
      WHEN
        notified_at IS NOT NULL
        AND julianday(notified_at) >
          julianday(
            'now',
            '-3 minutes'
          )
      THEN 1
      ELSE 0
    END AS has_priority

  FROM recruitment_watchers

  WHERE
    recruitment_id = ?
    AND is_active = 1

  ORDER BY
    julianday(created_at) ASC,
    rowid ASC
`);


const selectExpiredWatchersForRecruitment = db.prepare(`
  SELECT
    user_id

  FROM recruitment_watchers

  WHERE
    recruitment_id = ?
    AND is_active = 1
    AND notified_at IS NOT NULL
    AND julianday(notified_at) <=
      julianday(
        'now',
        '-3 minutes'
      )

  ORDER BY
    julianday(created_at) ASC,
    rowid ASC
`);


const selectExpiredWatchers = db.prepare(`
  SELECT
    recruitment_id,
    user_id

  FROM recruitment_watchers

  WHERE
    is_active = 1
    AND notified_at IS NOT NULL
    AND julianday(notified_at) <=
      julianday(
        'now',
        '-3 minutes'
      )

  ORDER BY
    recruitment_id ASC,
    julianday(created_at) ASC,
    rowid ASC
`);


const deactivateWatcher = db.prepare(`
  UPDATE recruitment_watchers

  SET
    is_active = 0

  WHERE
    recruitment_id = ?
    AND user_id = ?
    AND is_active = 1
`);


const markWatcherPriority = db.prepare(`
  UPDATE recruitment_watchers

  SET
    notified_at = strftime(
      '%Y-%m-%d %H:%M:%f',
      'now'
    )

  WHERE
    recruitment_id = ?
    AND user_id = ?
    AND is_active = 1
    AND notified_at IS NULL
`);


const selectWaitingWatchers = db.prepare(`
  SELECT
    user_id,
    created_at

  FROM recruitment_watchers

  WHERE
    recruitment_id = ?
    AND is_active = 1
    AND notified_at IS NULL

  ORDER BY
    julianday(created_at) ASC,
    rowid ASC
`);


const selectPriorityWatchers = db.prepare(`
  SELECT
    user_id,
    created_at,
    notified_at

  FROM recruitment_watchers

  WHERE
    recruitment_id = ?
    AND is_active = 1
    AND notified_at IS NOT NULL
    AND julianday(notified_at) >
      julianday(
        'now',
        '-3 minutes'
      )

  ORDER BY
    julianday(created_at) ASC,
    rowid ASC
`);


const selectRecruitmentsNeedingQueue = db.prepare(`
  SELECT DISTINCT
    r.id

  FROM recruitments r

  WHERE
    r.status = 'OPEN'

    AND (
      SELECT COUNT(*)
      FROM recruitment_members rm
      WHERE
        rm.recruitment_id = r.id
        AND rm.is_active = 1
    ) < r.capacity

    AND EXISTS (
      SELECT 1
      FROM recruitment_watchers rw
      WHERE
        rw.recruitment_id = r.id
        AND rw.is_active = 1
    )

  ORDER BY r.id ASC
`);


function getWatcherQueue(
  recruitmentId
) {
  return selectActiveWatchers
    .all(recruitmentId)
    .map(
      (
        row,
        index
      ) => ({
        userId:
          row.user_id,

        position:
          index + 1,

        createdAt:
          row.created_at,

        notifiedAt:
          row.notified_at,

        hasPriority:
          row.has_priority === 1,
      })
    );
}


function expireWatchersForRecruitment(
  recruitmentId
) {
  const expired =
    selectExpiredWatchersForRecruitment
      .all(recruitmentId);


  for (
    const watcher of expired
  ) {
    deactivateWatcher.run(
      recruitmentId,
      watcher.user_id
    );
  }


  return expired.map(
    (watcher) =>
      watcher.user_id
  );
}


function expireAllTimedOutWatchers() {
  const expired =
    selectExpiredWatchers.all();


  const recruitmentIds =
    new Set();


  for (
    const watcher of expired
  ) {
    deactivateWatcher.run(
      watcher.recruitment_id,
      watcher.user_id
    );


    recruitmentIds.add(
      watcher.recruitment_id
    );
  }


  return {
    expired,

    recruitmentIds:
      [...recruitmentIds],
  };
}


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
        (row) =>
          row.user_id
      );


  const newbieMemberIds =
    selectNewbieMembers
      .all(recruitmentId)
      .map(
        (row) =>
          row.user_id
      )
      .filter(
        (userId) =>
          memberIds.includes(
            userId
          )
      );


  const memberCount =
    memberIds.length;


  const watcherQueue =
    getWatcherQueue(
      recruitmentId
    );


  return {
    recruitment,
    memberIds,
    newbieMemberIds,
    memberCount,
    watcherQueue,

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
  db.transaction(
    (data) => {
      const status =
        data.memberIds.length >=
        data.capacity
          ? 'FULL'
          : 'OPEN';


      const result =
        insertRecruitment.run({
          guildId:
            data.guildId,

          channelId:
            data.channelId,

          type:
            data.type,

          creatorId:
            data.creatorId,

          voiceKind:
            data.voiceKind,

          voiceRoomNumber:
            data.voiceRoomNumber,

          gameName:
            data.gameName || null,

          description:
            data.description || null,

          capacity:
            data.capacity,

          startTime:
            data.startTime,

          status,
        });


      const recruitmentId =
        Number(
          result.lastInsertRowid
        );


      for (
        const userId of
          data.memberIds
      ) {
        upsertMember.run(
          recruitmentId,
          userId
        );
      }


      for (
        const userId of
          data.newbieMemberIds || []
      ) {
        insertNewbieMember.run(
          recruitmentId,
          userId
        );
      }


      return {
        id:
          recruitmentId,

        status,
      };
    }
  );


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
          code:
            'NOT_FOUND',
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
          code:
            'CLOSED',
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


      /*
       * 참여 검사 전에
       * 만료된 우선권 정리
       */
      expireWatchersForRecruitment(
        recruitmentId
      );


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
          code:
            'FULL',
        };
      }


      const freeSlots =
        recruitment.capacity -
        currentCount;


      const watcherQueue =
        getWatcherQueue(
          recruitmentId
        );


      const reservedWatchers =
        watcherQueue.slice(
          0,
          freeSlots
        );


      const reservedIds =
        reservedWatchers.map(
          (watcher) =>
            watcher.userId
        );


      /*
       * 현재 빈자리가 대기자에게
       * 전부 예약되어 있다면
       * 순번자가 아닌 사람은 참여 불가
       */
      if (
        watcherQueue.length >=
          freeSlots &&
        !reservedIds.includes(
          userId
        )
      ) {
        return {
          code:
            'QUEUE_RESERVED',

          priorityUserIds:
            reservedIds,

          watcherQueue,
        };
      }


      upsertMember.run(
        recruitmentId,
        userId
      );


      /*
       * 대기자가 참여했다면
       * 대기열에서는 제거
       */
      deactivateWatcher.run(
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
        code:
          'JOINED',

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
          code:
            'NOT_FOUND',
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
        code:
          'CANCELLED',

        becameAvailable,

        snapshot:
          getRecruitmentSnapshot(
            recruitmentId
          ),
      };
    }
  );


function createRecruitment(
  data
) {
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
  /*
   * 지나간 3분 우선권이 있으면
   * 먼저 정리
   */
  expireWatchersForRecruitment(
    recruitmentId
  );


  const snapshot =
    getRecruitmentSnapshot(
      recruitmentId
    );


  if (!snapshot) {
    return {
      code:
        'NOT_FOUND',
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


  /*
   * 이미 자리알림에 등록되어 있는지 확인
   */
  const existing =
    selectActiveWatcher.get(
      recruitmentId,
      userId
    );


  if (existing) {
    const watcher =
      snapshot.watcherQueue.find(
        (item) =>
          item.userId ===
          userId
      );


    return {
      code:
        'ALREADY_WATCHING',

      position:
        watcher?.position ||
        null,

      snapshot,
    };
  }


  const freeSlots =
    snapshot.remaining;


  /*
   * 핵심 수정 부분
   *
   * 빈자리가 있더라도
   * 그 빈자리가 기존 대기자에게
   * 전부 예약되어 있다면
   * 새 사람은 다음 순번으로 등록 가능
   *
   * 예:
   * 현재 1/2 + 1순위 우선권 진행 중
   * → 새 알림 신청자는 2순위
   *
   * 현재 0/2 + 대기자 1명
   * → 빈자리 2개 중 1개는 아직 일반 참여 가능
   * → 자리알림 대신 바로 참여 안내
   */
  const allOpenSlotsReserved =
    freeSlots > 0 &&
    snapshot.watcherQueue.length >=
      freeSlots;


  if (
    !snapshot.isFull &&
    !allOpenSlotsReserved
  ) {
    return {
      code:
        'NOT_FULL',
    };
  }


  upsertWatcher.run(
    recruitmentId,
    userId
  );


  const newSnapshot =
    getRecruitmentSnapshot(
      recruitmentId
    );


  const watcher =
    newSnapshot.watcherQueue.find(
      (item) =>
        item.userId ===
        userId
    );


  return {
    code:
      'WATCHING',

    position:
      watcher?.position ||
      null,

    snapshot:
      newSnapshot,
  };
}


function getActiveWatchers(
  recruitmentId
) {
  return getWatcherQueue(
    recruitmentId
  ).map(
    (watcher) =>
      watcher.userId
  );
}


const claimNextWatchersTransaction =
  db.transaction(
    (
      recruitmentId
    ) => {
      expireWatchersForRecruitment(
        recruitmentId
      );


      const recruitment =
        selectRecruitment.get(
          recruitmentId
        );


      if (!recruitment) {
        return [];
      }


      const memberCount =
        countActiveMembers.get(
          recruitmentId
        ).count;


      const freeSlots =
        Math.max(
          recruitment.capacity -
            memberCount,
          0
        );


      if (
        freeSlots <= 0
      ) {
        return [];
      }


      const currentPriority =
        selectPriorityWatchers.all(
          recruitmentId
        );


      const needed =
        Math.max(
          freeSlots -
            currentPriority.length,
          0
        );


      if (
        needed <= 0
      ) {
        return [];
      }


      const waiting =
        selectWaitingWatchers
          .all(recruitmentId)
          .slice(
            0,
            needed
          );


      const claimed = [];


      for (
        const watcher of waiting
      ) {
        const result =
          markWatcherPriority.run(
            recruitmentId,
            watcher.user_id
          );


        if (
          result.changes > 0
        ) {
          claimed.push(
            watcher.user_id
          );
        }
      }


      return claimed;
    }
  );


function claimNextWatchersForOpenSlots(
  recruitmentId
) {
  return claimNextWatchersTransaction(
    recruitmentId
  );
}


function removeRecruitmentWatcher(
  recruitmentId,
  userId
) {
  const result =
    deactivateWatcher.run(
      recruitmentId,
      userId
    );


  return (
    result.changes > 0
  );
}


/*
 * 이 함수가 아까 빠져 있어서
 * TypeError가 났던 부분입니다.
 */
function getRecruitmentIdsNeedingQueueProcessing() {
  return selectRecruitmentsNeedingQueue
    .all()
    .map(
      (row) =>
        row.id
    );
}


/*
 * 기존 코드 호환용
 */
function markWatchersNotified(
  recruitmentId,
  userIds
) {
  const transaction =
    db.transaction(
      () => {
        for (
          const userId of userIds
        ) {
          markWatcherPriority.run(
            recruitmentId,
            userId
          );
        }
      }
    );


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
  WAIT_PRIORITY_SECONDS,

  createRecruitment,
  getRecruitmentSnapshot,
  joinRecruitment,
  cancelRecruitment,

  addRecruitmentWatcher,
  getActiveWatchers,
  getWatcherQueue,

  claimNextWatchersForOpenSlots,
  removeRecruitmentWatcher,

  expireWatchersForRecruitment,
  expireAllTimedOutWatchers,

  getRecruitmentIdsNeedingQueueProcessing,

  markWatchersNotified,

  setRecruitmentMessageId,
  deleteRecruitment,
};