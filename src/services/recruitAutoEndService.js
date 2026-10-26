
const {
  EmbedBuilder
} = require('discord.js');

const {
  db
} = require('../database/db');

const {
  getRecruitmentTitle,
  getVoiceRoomLabel
} = require('../ui/recruitMessageBuilder');


/*
 * 구인글 등록 시각부터 3시간 후 자동 종료합니다.
 * 자동 종료 검사는 index.js에서 1분마다 실행합니다.
 */
const AUTO_END_AFTER_HOURS = 3;
const AUTO_END_AFTER_MS =
  AUTO_END_AFTER_HOURS * 60 * 60 * 1000;

const selectActiveRecruitments = db.prepare(`
  SELECT *
  FROM recruitments
  WHERE status IN ('OPEN', 'FULL')
  ORDER BY id ASC
`);

const selectActiveWatchers = db.prepare(`
  SELECT user_id
  FROM recruitment_watchers
  WHERE recruitment_id = ? AND is_active = 1
  ORDER BY julianday(created_at) ASC, rowid ASC
`);

const markRecruitmentEnded = db.prepare(`
  UPDATE recruitments
  SET status = 'ENDED', updated_at = datetime('now')
  WHERE id = ? AND status IN ('OPEN', 'FULL')
`);

const deactivateWatchers = db.prepare(`
  UPDATE recruitment_watchers
  SET is_active = 0
  WHERE recruitment_id = ? AND is_active = 1
`);

const stopNewbieProgress = db.prepare(`
  UPDATE newbie_party_progress
  SET is_running = 0,
      running_since = NULL,
      updated_at = datetime('now')
  WHERE recruitment_id = ? AND completed = 0
`);


/*
 * SQLite datetime('now')으로 저장된 UTC 시간을 파싱합니다.
 */
function parseCreatedAt(createdAt) {
  if (!createdAt) return null;

  const value = String(createdAt).trim().replace(' ', 'T');
  const date = new Date(value.endsWith('Z') ? value : `${value}Z`);

  return Number.isNaN(date.getTime()) ? null : date;
}


/*
 * 기존 코드와 연결된 곳을 위해 남겨두는 함수입니다.
 * 새 자동 종료 기준에는 시작 예정 시간이 사용되지 않습니다.
 */
function getScheduledStartTime(recruitment) {
  const createdAt = parseCreatedAt(recruitment.created_at);
  const match = String(recruitment.start_time || '').match(
    /^([01]\d|2[0-3]):([0-5]\d)$/
  );

  if (!createdAt || !match) return null;

  const kst = new Date(createdAt.getTime() + 9 * 60 * 60 * 1000);
  let scheduledTimestamp = Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate(),
    Number(match[1]) - 9,
    Number(match[2]),
    0,
    0
  );

  if (scheduledTimestamp < createdAt.getTime()) {
    scheduledTimestamp += 24 * 60 * 60 * 1000;
  }

  return scheduledTimestamp;
}


/*
 * ★ 변경: 시작 예정 시각이 아닌 실제 구인 등록 시각 기준
 */
function getAutoEndTime(recruitment) {
  const createdAt = parseCreatedAt(recruitment.created_at);
  if (!createdAt) return null;
  return createdAt.getTime() + AUTO_END_AFTER_MS;
}


const autoEndTransaction = db.transaction((recruitment) => {
  const watcherIds = selectActiveWatchers
    .all(recruitment.id)
    .map((row) => row.user_id);

  const result = markRecruitmentEnded.run(recruitment.id);
  if (result.changes <= 0) return { code: 'SKIPPED' };

  deactivateWatchers.run(recruitment.id);
  stopNewbieProgress.run(recruitment.id);

  return { code: 'ENDED', watcherIds };
});


/*
 * 원본 구인글의 내용을 교체합니다.
 * 새 채널 메시지는 올리지 않습니다.
 */
function buildAutoEndedMessage(recruitment) {
  const details = [
    `🎮 **${getRecruitmentTitle(recruitment, false)}**`,
    `👤 파티장 <@${recruitment.creator_id}>`,
    `🔊 **${getVoiceRoomLabel(recruitment)}**`,
  ];

  if (recruitment.game_name) {
    details.push(`🎲 게임: ${recruitment.game_name}`);
  }

  if (recruitment.description?.trim()) {
    details.push(`📝 ${recruitment.description.trim()}`);
  }

  details.push(
    '',
    '⏰ 구인글 등록 후 **3시간**이 지나 자동 종료되었습니다.',
    '모집·참여·자리알림이 종료되었습니다.'
  );

  return {
    content: '',
    embeds: [
      new EmbedBuilder()
        .setTitle('🔒 파티 종료')
        .setDescription(details.join('\n'))
    ],
    components: [],
    allowedMentions: { parse: [] },
  };
}


async function updateOriginalMessage(client, recruitment) {
  if (!recruitment.channel_id || !recruitment.message_id) return;

  try {
    const channel = await client.channels.fetch(recruitment.channel_id);
    if (!channel?.isTextBased()) return;

    const message = await channel.messages.fetch(recruitment.message_id);
    await message.edit(buildAutoEndedMessage(recruitment));
  } catch (error) {
    console.warn(
      `⚠️ 자동 종료 구인글 갱신 실패: ${recruitment.id}`,
      error.message
    );
  }
}


/*
 * 기존 자리알림 신청자에게만 DM으로 종료를 안내합니다.
 */
async function notifyWatchers(client, watcherIds, recruitment) {
  for (const userId of watcherIds) {
    try {
      const user = await client.users.fetch(userId);
      await user.send([
        '⏰ **희희낙락 자리알림 종료 안내**',
        '',
        '신청한 파티가 등록 후 3시간이 지나 종료되었습니다.',
        '자리알림도 함께 종료되었습니다.',
        '',
        `🎮 ${getRecruitmentTitle(recruitment, false)}`,
        `🔊 ${getVoiceRoomLabel(recruitment)}`,
      ].join('\n'));
    } catch (error) {
      console.warn(
        `⚠️ 자동 종료 자리알림 DM 실패: ${userId}`,
        error.message
      );
    }
  }
}


async function processExpiredRecruitments(client) {
  const now = Date.now();
  const recruitments = selectActiveRecruitments.all();

  for (const recruitment of recruitments) {
    const autoEndTime = getAutoEndTime(recruitment);
    if (autoEndTime === null || now < autoEndTime) continue;

    const result = autoEndTransaction(recruitment);
    if (result.code !== 'ENDED') continue;

    await updateOriginalMessage(client, recruitment);
    await notifyWatchers(client, result.watcherIds, recruitment);

    console.log(
      `⏰ [파티자동종료] 구인 ${recruitment.id} · 파티장 ${recruitment.creator_id}`
    );
  }
}


module.exports = {
  AUTO_END_AFTER_HOURS,
  getScheduledStartTime,
  getAutoEndTime,
  processExpiredRecruitments,
};