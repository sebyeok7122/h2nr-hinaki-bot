const {
  db
} = require('../database/db');

const {
  getRecruitmentSnapshot,
  removeRecruitmentWatcher
} = require('./recruitService');


/*
 * 특정 사용자가 현재 신청해둔
 * 활성 자리알림 구인 목록
 */
const selectUserActiveWatchers =
  db.prepare(`
    SELECT
      rw.recruitment_id

    FROM recruitment_watchers rw

    INNER JOIN recruitments r
      ON r.id = rw.recruitment_id

    WHERE
      rw.user_id = ?
      AND rw.is_active = 1
      AND r.guild_id = ?
      AND r.status IN (
        'OPEN',
        'FULL'
      )

    ORDER BY
      julianday(rw.created_at) ASC,
      rw.rowid ASC
  `);


/*
 * 자리알림 취소 전
 * 실제 본인 대기인지 확인
 */
const selectUserWatcher =
  db.prepare(`
    SELECT
      rw.recruitment_id

    FROM recruitment_watchers rw

    INNER JOIN recruitments r
      ON r.id = rw.recruitment_id

    WHERE
      rw.recruitment_id = ?
      AND rw.user_id = ?
      AND rw.is_active = 1
      AND r.guild_id = ?
  `);


/*
 * 내가 현재 걸어둔 자리알림을 가져옵니다.
 *
 * 각 구인의 실제 대기순번도
 * 현재 watcherQueue 기준으로 계산합니다.
 */
function getUserActiveWatchers(
  guildId,
  userId
) {
  const rows =
    selectUserActiveWatchers.all(
      userId,
      guildId
    );


  const entries = [];


  for (
    const row of rows
  ) {
    const snapshot =
      getRecruitmentSnapshot(
        row.recruitment_id
      );


    if (!snapshot) {
      continue;
    }


    const watcher =
      snapshot.watcherQueue.find(
        (item) =>
          item.userId ===
          userId
      );


    if (!watcher) {
      continue;
    }


    entries.push({
      recruitmentId:
        row.recruitment_id,

      recruitment:
        snapshot.recruitment,

      memberCount:
        snapshot.memberCount,

      capacity:
        snapshot.recruitment.capacity,

      position:
        watcher.position,

      hasPriority:
        watcher.hasPriority,

      notifiedAt:
        watcher.notifiedAt,

      createdAt:
        watcher.createdAt,
    });
  }


  return entries;
}


/*
 * /내자리알림에서
 * 본인의 자리알림 하나를 취소합니다.
 */
function cancelUserWatcher({
  guildId,
  userId,
  recruitmentId,
}) {
  const existing =
    selectUserWatcher.get(
      recruitmentId,
      userId,
      guildId
    );


  if (!existing) {
    return {
      code:
        'NOT_FOUND',
    };
  }


  const snapshot =
    getRecruitmentSnapshot(
      recruitmentId
    );


  const removed =
    removeRecruitmentWatcher(
      recruitmentId,
      userId
    );


  if (!removed) {
    return {
      code:
        'NOT_FOUND',
    };
  }


  return {
    code:
      'CANCELLED',

    snapshot,
  };
}


module.exports = {
  getUserActiveWatchers,
  cancelUserWatcher,
};