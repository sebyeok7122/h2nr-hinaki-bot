const {
  db
} = require('../database/db');

const {
  RECRUIT_CONFIG
} = require('../config/constants');

const {
  addPoints,
  promoteNewbieIfEligible
} = require('./pointService');


const REQUIRED_SECONDS =
  RECRUIT_CONFIG.NEWBIE_MIN_VOICE_MINUTES * 60;


/*
 * OPEN / FULL 상태의 신입파티를 모두 가져옵니다.
 *
 * FULL이었다가 누군가 취소해서 OPEN이 된 경우에도
 * 실행 중이던 타이머를 멈출 수 있어야 하기 때문입니다.
 */
const selectActiveNewbieParties =
  db.prepare(`
    SELECT
      id,
      guild_id,
      channel_id,
      message_id,
      voice_kind,
      voice_room_number,
      capacity,
      status

    FROM recruitments

    WHERE
      guild_id = ?
      AND type = 'NEWBIE'
      AND status IN (
        'OPEN',
        'FULL'
      )

    ORDER BY id ASC
  `);


/*
 * 특정 구인의 현재 참가자 목록
 */
const selectActivePartyMembers =
  db.prepare(`
    SELECT user_id

    FROM recruitment_members

    WHERE
      recruitment_id = ?
      AND is_active = 1

    ORDER BY joined_at ASC
  `);


/*
 * 신입파티 진행상황이 없으면 생성
 */
const insertProgress =
  db.prepare(`
    INSERT INTO newbie_party_progress (
      recruitment_id,
      guild_id
    )
    VALUES (?, ?)

    ON CONFLICT (
      recruitment_id
    )
    DO NOTHING
  `);


/*
 * 현재 진행상황 조회
 */
const selectProgress =
  db.prepare(`
    SELECT
      recruitment_id,
      guild_id,
      accumulated_seconds,
      running_since,
      is_running,
      completed,
      completed_at,
      created_at,
      updated_at,

      accumulated_seconds +
      CASE
        WHEN
          is_running = 1
          AND running_since IS NOT NULL
        THEN
          MAX(
            0,
            CAST(
              strftime('%s', 'now')
              AS INTEGER
            )
            -
            CAST(
              strftime('%s', running_since)
              AS INTEGER
            )
          )
        ELSE 0
      END
      AS total_seconds

    FROM newbie_party_progress

    WHERE recruitment_id = ?
  `);


/*
 * 카운트 시작
 */
const startProgress =
  db.prepare(`
    UPDATE newbie_party_progress

    SET
      is_running = 1,
      running_since = datetime('now'),
      updated_at = datetime('now')

    WHERE
      recruitment_id = ?
      AND completed = 0
      AND is_running = 0
  `);


/*
 * 실행 중인 시간을 DB 누적값에 중간 저장합니다.
 *
 * 신입파티 상태검사가 5초마다 실행되므로
 * 정상 활동 중에는 약 5초 단위로 누적시간이 저장됩니다.
 *
 * Railway 재배포 / 봇 재시작이 발생하더라도
 * 마지막 체크포인트까지의 활동시간은 유지됩니다.
 */
const checkpointProgress =
  db.prepare(`
    UPDATE newbie_party_progress

    SET
      accumulated_seconds =
        accumulated_seconds +
        MAX(
          0,
          CAST(
            strftime('%s', 'now')
            AS INTEGER
          )
          -
          CAST(
            strftime('%s', running_since)
            AS INTEGER
          )
        ),

      running_since = datetime('now'),
      updated_at = datetime('now')

    WHERE
      recruitment_id = ?
      AND completed = 0
      AND is_running = 1
      AND running_since IS NOT NULL
  `);


/*
 * 카운트 정지
 */
const pauseProgress =
  db.prepare(`
    UPDATE newbie_party_progress

    SET
      accumulated_seconds =
        accumulated_seconds +
        MAX(
          0,
          CAST(
            strftime('%s', 'now')
            AS INTEGER
          )
          -
          CAST(
            strftime('%s', running_since)
            AS INTEGER
          )
        ),

      is_running = 0,
      running_since = NULL,
      updated_at = datetime('now')

    WHERE
      recruitment_id = ?
      AND completed = 0
      AND is_running = 1
      AND running_since IS NOT NULL
  `);


/*
 * 목표시간을 실제로 달성했을 때만
 * 완료 상태를 가져가는 SQL입니다.
 */
const claimCompletedProgress =
  db.prepare(`
    UPDATE newbie_party_progress

    SET
      accumulated_seconds =
        accumulated_seconds +
        CASE
          WHEN
            is_running = 1
            AND running_since IS NOT NULL
          THEN
            MAX(
              0,
              CAST(
                strftime('%s', 'now')
                AS INTEGER
              )
              -
              CAST(
                strftime('%s', running_since)
                AS INTEGER
              )
            )
          ELSE 0
        END,

      is_running = 0,
      running_since = NULL,

      completed = 1,
      completed_at = datetime('now'),
      updated_at = datetime('now')

    WHERE
      recruitment_id = ?
      AND completed = 0

      AND (
        accumulated_seconds +
        CASE
          WHEN
            is_running = 1
            AND running_since IS NOT NULL
          THEN
            MAX(
              0,
              CAST(
                strftime('%s', 'now')
                AS INTEGER
              )
              -
              CAST(
                strftime('%s', running_since)
                AS INTEGER
              )
            )
          ELSE 0
        END
      ) >= ?
  `);


/*
 * 두 역할의 보상을 합쳐 1인당 하루(KST) 한 번만 지급합니다.
 * 신입 본인의 +1P는 포인트 원장에만 저장해
 * 기존의 활동 랭킹과 뉴비메이트 집계에는 포함하지 않습니다.
 */
const NEWBIE_PARTICIPATION_SOURCE = 'NEWBIE_PARTY_PARTICIPATION';

const selectDailyReward = db.prepare(`
    SELECT 1
    FROM newbie_activity
    WHERE guild_id = @guildId
      AND user_id = @userId
      AND qualified = 1
      AND date(completed_at, '+9 hours') = date('now', '+9 hours')

    UNION ALL

    SELECT 1
    FROM point_transactions
    WHERE guild_id = @guildId
      AND user_id = @userId
      AND source = @newbieSource
      AND date(created_at, '+9 hours') = date('now', '+9 hours')

    LIMIT 1
  `);

const insertActivityRecord = db.prepare(`
    INSERT INTO newbie_activity (
      guild_id,
      recruitment_id,
      user_id,
      voice_minutes,
      qualified,
      points_awarded,
      completed_at
    )
    VALUES (?, ?, ?, ?, 1, 0, datetime('now'))
  `);

const updateActivityPoints =
  db.prepare(`
    UPDATE newbie_activity

    SET
      points_awarded = ?

    WHERE
      recruitment_id = ?
      AND user_id = ?
  `);


function getActiveNewbieParties(
  guildId
) {
  const rows =
    selectActiveNewbieParties.all(
      guildId
    );


  return rows.map(
    (row) => {
      const memberIds =
        selectActivePartyMembers
          .all(row.id)
          .map(
            (memberRow) =>
              memberRow.user_id
          );


      return {
        recruitmentId:
          row.id,

        guildId:
          row.guild_id,

        channelId:
          row.channel_id,

        messageId:
          row.message_id,

        voiceKind:
          row.voice_kind,

        voiceRoomNumber:
          row.voice_room_number,

        capacity:
          row.capacity,

        status:
          row.status,

        memberIds,

        isActuallyFull:
          row.status === 'FULL' &&
          memberIds.length ===
            row.capacity,
      };
    }
  );
}


function getActiveNewbiePartiesForMember(
  guildId,
  userId
) {
  return getActiveNewbieParties(
    guildId
  ).filter(
    (party) =>
      party.memberIds.includes(
        userId
      )
  );
}


/*
 * 기존 함수 이름도 유지합니다.
 */
function getFullNewbieParties(
  guildId
) {
  return getActiveNewbieParties(
    guildId
  ).filter(
    (party) =>
      party.isActuallyFull
  );
}


function getFullNewbiePartiesForMember(
  guildId,
  userId
) {
  return getFullNewbieParties(
    guildId
  ).filter(
    (party) =>
      party.memberIds.includes(
        userId
      )
  );
}


function ensureNewbiePartyProgress(
  guildId,
  recruitmentId
) {
  insertProgress.run(
    recruitmentId,
    guildId
  );

  return getNewbiePartyProgress(
    recruitmentId
  );
}


function getNewbiePartyProgress(
  recruitmentId
) {
  const row =
    selectProgress.get(
      recruitmentId
    );


  if (!row) {
    return null;
  }


  const totalSeconds =
    Number(
      row.total_seconds || 0
    );


  return {
    recruitmentId:
      row.recruitment_id,

    guildId:
      row.guild_id,

    accumulatedSeconds:
      Number(
        row.accumulated_seconds || 0
      ),

    totalSeconds,

    requiredSeconds:
      REQUIRED_SECONDS,

    remainingSeconds:
      Math.max(
        REQUIRED_SECONDS -
          totalSeconds,
        0
      ),

    isRunning:
      row.is_running === 1,

    completed:
      row.completed === 1,

    reachedGoal:
      totalSeconds >=
      REQUIRED_SECONDS,

    runningSince:
      row.running_since,

    completedAt:
      row.completed_at,
  };
}


function startNewbiePartyTimer(
  guildId,
  recruitmentId
) {
  ensureNewbiePartyProgress(
    guildId,
    recruitmentId
  );


  const currentProgress =
    getNewbiePartyProgress(
      recruitmentId
    );


  /*
   * 이미 카운트 중이라면
   * 새로 시작하지 않고 지금까지의 시간을
   * accumulated_seconds에 중간 저장합니다.
   */
  if (
    currentProgress?.isRunning
  ) {
    checkpointProgress.run(
      recruitmentId
    );


    return {
      started:
        false,

      progress:
        getNewbiePartyProgress(
          recruitmentId
        ),
    };
  }


  const result =
    startProgress.run(
      recruitmentId
    );


  return {
    started:
      result.changes > 0,

    progress:
      getNewbiePartyProgress(
        recruitmentId
      ),
  };
}


function pauseNewbiePartyTimer(
  recruitmentId
) {
  const result =
    pauseProgress.run(
      recruitmentId
    );


  return {
    paused:
      result.changes > 0,

    progress:
      getNewbiePartyProgress(
        recruitmentId
      ),
  };
}


function isNewbiePartyGoalReached(
  recruitmentId
) {
  const progress =
    getNewbiePartyProgress(
      recruitmentId
    );


  if (!progress) {
    return false;
  }


  return progress.reachedGoal;
}


/*
 * 완료 처리와 두 역할의 포인트 지급을 한 DB 트랜잭션으로 묶습니다.
 * 활동 횟수는 기존 멤버에게만 기록합니다.
 */
const completePartyTransaction = db.transaction(
  (guildId, recruitmentId, { helperUserIds, newbieUserIds }) => {
    const claim = claimCompletedProgress.run(
      recruitmentId,
      REQUIRED_SECONDS
    );

    if (claim.changes === 0) {
      return { code: 'NOT_READY_OR_COMPLETED' };
    }

    const progress = getNewbiePartyProgress(recruitmentId);
    const voiceMinutes = Math.floor(
      (progress?.totalSeconds || REQUIRED_SECONDS) / 60
    );
    const newbieIds = new Set(newbieUserIds);
    const participantIds = new Set([...helperUserIds, ...newbieIds]);
    const awards = [];
    const dailyLimitUserIds = [];

    for (const userId of participantIds) {
      if (selectDailyReward.get({
        guildId,
        userId,
        newbieSource: NEWBIE_PARTICIPATION_SOURCE,
      })) {
        dailyLimitUserIds.push(userId);
        continue;
      }

      const isNewbie = newbieIds.has(userId);
      const points = isNewbie
        ? RECRUIT_CONFIG.NEWBIE_PARTICIPATION_POINTS
        : RECRUIT_CONFIG.NEWBIE_ACTIVITY_POINTS;

      if (!isNewbie) {
        insertActivityRecord.run(guildId, recruitmentId, userId, voiceMinutes);
      }

      const result = addPoints({
        guildId,
        userId,
        amount: points,
        source: isNewbie
          ? NEWBIE_PARTICIPATION_SOURCE
          : 'NEWBIE_PARTY_ACTIVITY',
        description: isNewbie ? '신입파티 신입 참여 완료' : '신입파티 활동 완료',
        referenceType: 'RECRUITMENT',
        referenceId: String(recruitmentId),
      });

      if (result.code !== 'OK') {
        throw new Error(`신입파티 포인트 지급 실패: ${userId}`);
      }

      if (!isNewbie) {
        updateActivityPoints.run(points, recruitmentId, userId);
      }

      awards.push({ userId, points, isNewbie });
    }

    return { code: 'COMPLETED', awards, dailyLimitUserIds, progress };
  }
);


function completeNewbieParty(guildId, recruitmentId, participants) {
  return completePartyTransaction(guildId, recruitmentId, participants);
}


/*
 * Discord 역할 변경은 DB 지급 완료 뒤에 처리합니다.
 * 역할 변경에 실패해도 지급 결과는 그대로 안내합니다.
 */
async function promoteAwardedNewbies(guild, awards) {
  const promotedUserIds = [];

  for (const { userId, isNewbie } of awards) {
    if (!isNewbie) {
      continue;
    }

    try {
      const result = await promoteNewbieIfEligible(guild, userId);

      if (result.code === 'PROMOTED') {
        promotedUserIds.push(userId);
      } else if (result.error) {
        console.warn(`⚠️ [신입활동] 자동등업 실패: ${userId}`, result.error.message);
      }
    } catch (error) {
      console.warn(`⚠️ [신입활동] 자동등업 실패: ${userId}`, error.message);
    }
  }

  return promotedUserIds;
}

module.exports = {
  getActiveNewbieParties,
  getActiveNewbiePartiesForMember,

  getFullNewbieParties,
  getFullNewbiePartiesForMember,

  ensureNewbiePartyProgress,
  getNewbiePartyProgress,

  startNewbiePartyTimer,
  pauseNewbiePartyTimer,

  isNewbiePartyGoalReached,
  completeNewbieParty,
  promoteAwardedNewbies,
};