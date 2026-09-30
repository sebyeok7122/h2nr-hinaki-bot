const {
  db
} = require('../database/db');


/*
 * ─────────────────────────────
 * 구인글 삭제 기록
 * ─────────────────────────────
 *
 * Discord 구인 메시지가 삭제되었을 때
 * 운영 기록을 영구 보관합니다.
 *
 * deleted_by_user_id:
 * 감사로그 등으로 실제 삭제자를
 * 확인할 수 있을 때만 저장합니다.
 *
 * 확인할 수 없는 경우 NULL입니다.
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS recruitment_delete_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    recruitment_id INTEGER NOT NULL,

    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,

    creator_id TEXT NOT NULL,

    deleted_by_user_id TEXT,

    type TEXT NOT NULL,

    voice_kind TEXT NOT NULL,
    voice_room_number INTEGER NOT NULL,

    game_name TEXT,
    description TEXT,

    capacity INTEGER NOT NULL,
    start_time TEXT NOT NULL,

    deleted_at TEXT NOT NULL
      DEFAULT (datetime('now'))
  );


  CREATE INDEX IF NOT EXISTS
    idx_recruit_delete_logs_creator

  ON recruitment_delete_logs (
    guild_id,
    creator_id,
    deleted_at
  );


  CREATE INDEX IF NOT EXISTS
    idx_recruit_delete_logs_recruitment

  ON recruitment_delete_logs (
    recruitment_id
  );
`);


/*
 * Discord message_id로
 * 실제 희낙이 구인글인지 확인합니다.
 */
const selectRecruitmentByMessageId =
  db.prepare(`
    SELECT *
    FROM recruitments

    WHERE
      guild_id = ?
      AND message_id = ?
  `);


/*
 * 같은 구인이 중복 기록되는 것을
 * 막기 위한 확인용
 */
const selectExistingDeleteLog =
  db.prepare(`
    SELECT id
    FROM recruitment_delete_logs

    WHERE recruitment_id = ?
    LIMIT 1
  `);


/*
 * 삭제 당시 구인 정보를
 * 그대로 스냅샷으로 기록합니다.
 */
const insertDeleteLog =
  db.prepare(`
    INSERT INTO recruitment_delete_logs (
      recruitment_id,

      guild_id,
      channel_id,
      message_id,

      creator_id,
      deleted_by_user_id,

      type,

      voice_kind,
      voice_room_number,

      game_name,
      description,

      capacity,
      start_time
    )

    VALUES (
      @recruitmentId,

      @guildId,
      @channelId,
      @messageId,

      @creatorId,
      @deletedByUserId,

      @type,

      @voiceKind,
      @voiceRoomNumber,

      @gameName,
      @description,

      @capacity,
      @startTime
    )
  `);


/*
 * 삭제된 구인은 더 이상
 * 일반 참여/자리알림 처리를 하지 않습니다.
 */
const markRecruitmentDeleted =
  db.prepare(`
    UPDATE recruitments

    SET
      status = 'DELETED',
      updated_at = datetime('now')

    WHERE id = ?
  `);


/*
 * 구인글이 사라지면
 * 자리알림 대기자도 모두 종료합니다.
 */
const deactivateRecruitmentWatchers =
  db.prepare(`
    UPDATE recruitment_watchers

    SET
      is_active = 0

    WHERE
      recruitment_id = ?
      AND is_active = 1
  `);


/*
 * 신입파티 활동시간이 돌고 있었다면
 * 삭제 시점에서 중단합니다.
 */
const stopNewbiePartyProgress =
  db.prepare(`
    UPDATE newbie_party_progress

    SET
      is_running = 0,
      running_since = NULL,
      updated_at = datetime('now')

    WHERE
      recruitment_id = ?
      AND completed = 0
  `);


/*
 * 삭제 전에 자리알림 신청자가 누구였는지
 * DM 발송용으로 가져옵니다.
 */
const selectActiveWatcherIds =
  db.prepare(`
    SELECT user_id

    FROM recruitment_watchers

    WHERE
      recruitment_id = ?
      AND is_active = 1

    ORDER BY
      julianday(created_at) ASC,
      rowid ASC
  `);


/*
 * 특정 생성자의 누적 구인글 삭제 횟수
 */
const countCreatorDeleteLogs =
  db.prepare(`
    SELECT
      COUNT(*) AS count

    FROM recruitment_delete_logs

    WHERE
      guild_id = ?
      AND creator_id = ?
  `);


/*
 * 최근 삭제 기록 조회
 *
 * 추후 /구인삭제기록 명령어에서도
 * 그대로 사용할 수 있습니다.
 */
const selectCreatorDeleteLogs =
  db.prepare(`
    SELECT *

    FROM recruitment_delete_logs

    WHERE
      guild_id = ?
      AND creator_id = ?

    ORDER BY
      id DESC

    LIMIT ?
  `);


const recordDeleteTransaction =
  db.transaction(
    (
      recruitment,
      deletedByUserId
    ) => {
      const existing =
        selectExistingDeleteLog.get(
          recruitment.id
        );


      /*
       * 같은 메시지 삭제 이벤트가
       * 중복으로 들어와도 한 번만 기록
       */
      if (existing) {
        return {
          code:
            'ALREADY_RECORDED',
        };
      }


      const watcherIds =
        selectActiveWatcherIds
          .all(
            recruitment.id
          )
          .map(
            (row) =>
              row.user_id
          );


      insertDeleteLog.run({
        recruitmentId:
          recruitment.id,

        guildId:
          recruitment.guild_id,

        channelId:
          recruitment.channel_id,

        messageId:
          recruitment.message_id,

        creatorId:
          recruitment.creator_id,

        deletedByUserId:
          deletedByUserId || null,

        type:
          recruitment.type,

        voiceKind:
          recruitment.voice_kind,

        voiceRoomNumber:
          recruitment.voice_room_number,

        gameName:
          recruitment.game_name || null,

        description:
          recruitment.description || null,

        capacity:
          recruitment.capacity,

        startTime:
          recruitment.start_time,
      });


      markRecruitmentDeleted.run(
        recruitment.id
      );


      deactivateRecruitmentWatchers.run(
        recruitment.id
      );


      stopNewbiePartyProgress.run(
        recruitment.id
      );


      const deleteCount =
        countCreatorDeleteLogs.get(
          recruitment.guild_id,
          recruitment.creator_id
        ).count;


      return {
        code:
          'RECORDED',

        recruitment,

        watcherIds,

        deleteCount,
      };
    }
  );


function getRecruitmentByDeletedMessage(
  guildId,
  messageId
) {
  return (
    selectRecruitmentByMessageId.get(
      guildId,
      messageId
    ) || null
  );
}


function recordRecruitmentDeletion(
  recruitment,
  deletedByUserId = null
) {
  return recordDeleteTransaction(
    recruitment,
    deletedByUserId
  );
}


function getCreatorDeleteCount(
  guildId,
  creatorId
) {
  return countCreatorDeleteLogs.get(
    guildId,
    creatorId
  ).count;
}


function getCreatorDeleteLogs(
  guildId,
  creatorId,
  limit = 10
) {
  return selectCreatorDeleteLogs.all(
    guildId,
    creatorId,
    limit
  );
}


module.exports = {
  getRecruitmentByDeletedMessage,
  recordRecruitmentDeletion,

  getCreatorDeleteCount,
  getCreatorDeleteLogs,
};