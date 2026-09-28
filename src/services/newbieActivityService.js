const {
  db
} = require('../database/db');

const {
  RECRUIT_CONFIG
} = require('../config/constants');

const {
  addPoints
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
 *
 * completed = 0 조건 덕분에
 * 같은 구인을 두 번 완료할 수 없습니다.
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
 * 같은 구인 + 같은 멤버로
 * 활동기록이 중복 생성되지 않도록 합니다.
 */
const insertActivityRecord =
  db.prepare(`
    INSERT OR IGNORE INTO newbie_activity (
      guild_id,
      recruitment_id,
      user_id,
      voice_minutes,
      qualified,
      points_awarded,
      completed_at
    )
    VALUES (
      ?,
      ?,
      ?,
      ?,
      1,
      0,
      datetime('now')
    )
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
 * 목표시간을 채운 신입파티의
 * 도우미들에게 포인트를 지급합니다.
 *
 * helperUserIds에는
 * 신입을 제외한 멤버만 넘겨줍니다.
 */
const completePartyTransaction =
  db.transaction(
    (
      guildId,
      recruitmentId,
      helperUserIds
    ) => {
      const claim =
        claimCompletedProgress.run(
          recruitmentId,
          REQUIRED_SECONDS
        );


      /*
       * 아직 시간이 안 됐거나
       * 이미 완료된 구인
       */
      if (
        claim.changes === 0
      ) {
        return {
          code:
            'NOT_READY_OR_COMPLETED',

          awardedUserIds: [],
        };
      }


      const progress =
        getNewbiePartyProgress(
          recruitmentId
        );


      const voiceMinutes =
        Math.floor(
          (
            progress?.totalSeconds ||
            REQUIRED_SECONDS
          ) / 60
        );


      const uniqueHelpers = [
        ...new Set(
          helperUserIds
        ),
      ];


      const awardedUserIds = [];


      for (
        const userId of uniqueHelpers
      ) {
        /*
         * 먼저 활동기록 자리를 확보합니다.
         * 이미 존재한다면 포인트를 또 주지 않습니다.
         */
        const activityResult =
          insertActivityRecord.run(
            guildId,
            recruitmentId,
            userId,
            voiceMinutes
          );


        if (
          activityResult.changes === 0
        ) {
          continue;
        }


        const pointResult =
          addPoints({
            guildId,
            userId,

            amount:
              RECRUIT_CONFIG.NEWBIE_ACTIVITY_POINTS,

            source:
              'NEWBIE_PARTY_ACTIVITY',

            description:
              '신입파티 활동 완료',

            referenceType:
              'RECRUITMENT',

            referenceId:
              String(
                recruitmentId
              ),
          });


        if (
          pointResult.code !==
          'OK'
        ) {
          throw new Error(
            `신입파티 포인트 지급 실패: ${userId}`
          );
        }


        updateActivityPoints.run(
          RECRUIT_CONFIG.NEWBIE_ACTIVITY_POINTS,
          recruitmentId,
          userId
        );


        awardedUserIds.push(
          userId
        );
      }


      return {
        code:
          'COMPLETED',

        awardedUserIds,

        pointsEach:
          RECRUIT_CONFIG.NEWBIE_ACTIVITY_POINTS,

        progress:
          getNewbiePartyProgress(
            recruitmentId
          ),
      };
    }
  );


function completeNewbieParty(
  guildId,
  recruitmentId,
  helperUserIds
) {
  return completePartyTransaction(
    guildId,
    recruitmentId,
    helperUserIds
  );
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
};