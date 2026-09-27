const {
  db
} = require('../database/db');

const {
  RECRUIT_CONFIG
} = require('../config/constants');


const REQUIRED_SECONDS =
  RECRUIT_CONFIG.NEWBIE_MIN_VOICE_MINUTES * 60;


/*
 * 현재 FULL 상태인 신입파티를 찾습니다.
 */
const selectFullNewbieParties =
  db.prepare(`
    SELECT
      id,
      guild_id,
      voice_kind,
      voice_room_number,
      capacity,
      status

    FROM recruitments

    WHERE
      guild_id = ?
      AND type = 'NEWBIE'
      AND status = 'FULL'

    ORDER BY id ASC
  `);


/*
 * 특정 구인의 현재 참가자 목록입니다.
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
 * 신입파티 진행상황이 없으면 생성합니다.
 */
const insertProgress = db.prepare(`
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
 * 현재 누적시간을 가져옵니다.
 *
 * 카운트 중이라면
 * DB에 저장된 누적시간 +
 * running_since 이후 흐른 시간까지
 * 함께 계산합니다.
 */
const selectProgress = db.prepare(`
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
 * 아직 카운트 중이 아닐 때만 시작합니다.
 */
const startProgress = db.prepare(`
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
 * 카운트 정지 시
 * 지금까지 흐른 시간을 accumulated_seconds에
 * 실제로 저장합니다.
 */
const pauseProgress = db.prepare(`
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


function getFullNewbieParties(
  guildId
) {
  const rows =
    selectFullNewbieParties.all(
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
          memberIds.length >=
          row.capacity,
      };
    }
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


module.exports = {
  getFullNewbieParties,
  getFullNewbiePartiesForMember,

  ensureNewbiePartyProgress,
  getNewbiePartyProgress,

  startNewbiePartyTimer,
  pauseNewbiePartyTimer,

  isNewbiePartyGoalReached,
};