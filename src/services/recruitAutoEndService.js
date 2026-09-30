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
 * 시작 예정 시각으로부터
 * 6시간이 지나면 자동 종료
 */
const AUTO_END_AFTER_HOURS =
  3;

const AUTO_END_AFTER_MS =
  AUTO_END_AFTER_HOURS *
  60 *
  60 *
  1000;


/*
 * 현재 살아있는 모든 구인
 */
const selectActiveRecruitments =
  db.prepare(`
    SELECT *

    FROM recruitments

    WHERE status IN (
      'OPEN',
      'FULL'
    )

    ORDER BY id ASC
  `);


/*
 * 자동 종료되기 전
 * 자리알림 신청자를 가져옵니다.
 */
const selectActiveWatchers =
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
 * 정상적인 자동 종료
 *
 * 임의삭제 DELETED와 구분됩니다.
 */
const markRecruitmentEnded =
  db.prepare(`
    UPDATE recruitments

    SET
      status = 'ENDED',
      updated_at = datetime('now')

    WHERE
      id = ?
      AND status IN (
        'OPEN',
        'FULL'
      )
  `);


/*
 * 자리알림 종료
 */
const deactivateWatchers =
  db.prepare(`
    UPDATE recruitment_watchers

    SET
      is_active = 0

    WHERE
      recruitment_id = ?
      AND is_active = 1
  `);


/*
 * 신입파티 활동시간도 중지
 */
const stopNewbieProgress =
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
 * SQLite의 UTC created_at을
 * JavaScript Date로 변환합니다.
 */
function parseCreatedAt(
  createdAt
) {
  if (!createdAt) {
    return null;
  }


  const value =
    String(createdAt)
      .trim()
      .replace(
        ' ',
        'T'
      );


  const date =
    new Date(
      value.endsWith('Z')
        ? value
        : `${value}Z`
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }


  return date;
}


/*
 * 구인의 실제 시작 예정 시각 계산
 *
 * DB의 start_time은
 * "15:00" 같은 한국시간 문자열입니다.
 *
 * created_at의 한국 날짜를 기준으로
 * 시작 예정 시간을 계산합니다.
 *
 * 만약 생성 시각보다 start_time이 이전이면
 * 다음 날 시작 예정으로 판단합니다.
 *
 * 예:
 * 밤 23:00에 생성
 * 시작 예정 01:00
 * → 다음 날 01:00
 */
function getScheduledStartTime(
  recruitment
) {
  const createdAt =
    parseCreatedAt(
      recruitment.created_at
    );


  if (!createdAt) {
    return null;
  }


  const match =
    String(
      recruitment.start_time || ''
    ).match(
      /^([01]\d|2[0-3]):([0-5]\d)$/
    );


  if (!match) {
    return null;
  }


  const hour =
    Number(match[1]);

  const minute =
    Number(match[2]);


  /*
   * UTC 생성시각 → 한국시간 날짜 확인
   */
  const KST_OFFSET_MS =
    9 *
    60 *
    60 *
    1000;


  const createdKst =
    new Date(
      createdAt.getTime() +
      KST_OFFSET_MS
    );


  const year =
    createdKst.getUTCFullYear();

  const month =
    createdKst.getUTCMonth();

  const day =
    createdKst.getUTCDate();


  /*
   * 한국시간 HH:MM을
   * 다시 UTC timestamp로 변환
   */
  let scheduledTimestamp =
    Date.UTC(
      year,
      month,
      day,
      hour - 9,
      minute,
      0,
      0
    );


  /*
   * 시작 예정 시간이
   * 구인 생성 시각보다 이미 이전이라면
   * 다음 날 시작으로 처리
   */
  if (
    scheduledTimestamp <
    createdAt.getTime()
  ) {
    scheduledTimestamp +=
      24 *
      60 *
      60 *
      1000;
  }


  return scheduledTimestamp;
}


/*
 * 자동 종료 예정 시각
 */
function getAutoEndTime(
  recruitment
) {
  const scheduledStart =
    getScheduledStartTime(
      recruitment
    );


  if (
    scheduledStart === null
  ) {
    return null;
  }


  return (
    scheduledStart +
    AUTO_END_AFTER_MS
  );
}


/*
 * 한 파티를 자동 종료
 */
const autoEndTransaction =
  db.transaction(
    (
      recruitment
    ) => {
      const watcherIds =
        selectActiveWatchers
          .all(
            recruitment.id
          )
          .map(
            (row) =>
              row.user_id
          );


      const result =
        markRecruitmentEnded.run(
          recruitment.id
        );


      if (
        result.changes <= 0
      ) {
        return {
          code:
            'SKIPPED',
        };
      }


      deactivateWatchers.run(
        recruitment.id
      );


      stopNewbieProgress.run(
        recruitment.id
      );


      return {
        code:
          'ENDED',

        watcherIds,
      };
    }
  );


/*
 * 원본 구인글에 표시할
 * 자동 종료 화면
 */
function buildAutoEndedMessage(
  recruitment
) {
  const description =
    recruitment.description
      ?.trim() ||
    '작성된 설명 없음';


  const embed =
    new EmbedBuilder()
      .setTitle(
        '⏰ 파티 자동 종료'
      )
      .setDescription(
        [
          `🎮 **${getRecruitmentTitle(recruitment, false)}**`,
          `👤 파티장 <@${recruitment.creator_id}>`,
          `🔊 **${getVoiceRoomLabel(recruitment)}**`,
          `🕘 시작 예정 **${recruitment.start_time}**`,
          `📝 ${description}`,
          '',
          `⏰ 시작 예정 시간으로부터 **${AUTO_END_AFTER_HOURS}시간**이 지나`,
          '파티가 자동으로 종료되었습니다.',
          '',
          '※ 자동 종료는 정상 종료 처리이며',
          '구인글 삭제 기록에는 포함되지 않습니다.',
        ].join('\n')
      );


  return {
    content:
      '',

    embeds:
      [embed],

    components:
      [],

    allowedMentions: {
      parse: [],
    },
  };
}


/*
 * 원본 구인글을
 * 자동 종료 화면으로 변경합니다.
 */
async function updateOriginalMessage(
  client,
  recruitment
) {
  if (
    !recruitment.channel_id ||
    !recruitment.message_id
  ) {
    return;
  }


  try {
    const channel =
      await client.channels.fetch(
        recruitment.channel_id
      );


    if (
      !channel ||
      !channel.isTextBased()
    ) {
      return;
    }


    const message =
      await channel.messages.fetch(
        recruitment.message_id
      );


    await message.edit(
      buildAutoEndedMessage(
        recruitment
      )
    );


  } catch (error) {
    console.warn(
      `⚠️ 자동 종료 구인글 갱신 실패: ${recruitment.id}`,
      error.message
    );
  }
}


/*
 * 자리알림 신청자 안내
 */
async function notifyWatchers(
  client,
  watcherIds,
  recruitment
) {
  for (
    const userId of
      watcherIds
  ) {
    try {
      const user =
        await client.users.fetch(
          userId
        );


      await user.send(
        [
          '⏰ **희희낙락 자리알림 종료 안내**',
          '',
          '해당 파티가 자동 종료되어',
          '자리알림도 함께 종료되었습니다.',
          '',
          `🎮 ${getRecruitmentTitle(recruitment, false)}`,
          `🔊 ${getVoiceRoomLabel(recruitment)}`,
          `🕘 시작 예정 ${recruitment.start_time}`,
        ].join('\n')
      );


    } catch (error) {
      console.warn(
        `⚠️ 자동 종료 자리알림 DM 실패: ${userId}`,
        error.message
      );
    }
  }
}


/*
 * 모든 구인을 검사해서
 * 시간이 지난 파티를 자동 종료합니다.
 */
async function processExpiredRecruitments(
  client
) {
  const now =
    Date.now();


  const recruitments =
    selectActiveRecruitments.all();


  for (
    const recruitment of
      recruitments
  ) {
    const autoEndTime =
      getAutoEndTime(
        recruitment
      );


    if (
      autoEndTime === null ||
      now <
        autoEndTime
    ) {
      continue;
    }


    const result =
      autoEndTransaction(
        recruitment
      );


    if (
      result.code !==
      'ENDED'
    ) {
      continue;
    }


    await updateOriginalMessage(
      client,
      recruitment
    );


    await notifyWatchers(
      client,
      result.watcherIds,
      recruitment
    );


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