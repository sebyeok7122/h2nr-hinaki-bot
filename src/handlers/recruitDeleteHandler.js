const {
  AuditLogEvent,
  EmbedBuilder
} = require('discord.js');

const {
  LOG_CHANNEL_IDS
} = require('../config/constants');

const {
  getRecruitmentByDeletedMessage,
  recordRecruitmentDeletion
} = require('../services/recruitDeleteService');

const {
  getRecruitmentTitle,
  getVoiceRoomLabel
} = require('../ui/recruitMessageBuilder');


/*
 * 잠깐 기다리기
 *
 * Discord 감사로그는
 * 메시지 삭제 이벤트보다 조금 늦게
 * 기록되는 경우가 있어서 사용합니다.
 */
function sleep(
  milliseconds
) {
  return new Promise(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds
      );
    }
  );
}


/*
 * 감사로그에서 삭제자를 한 번 확인합니다.
 */
async function findDeletedByUserIdOnce(
  guild,
  client,
  channelId
) {
  const auditLogs =
    await guild.fetchAuditLogs({
      type:
        AuditLogEvent.MessageDelete,

      limit:
        10,
    });


  const now =
    Date.now();


  for (
    const entry of
      auditLogs.entries.values()
  ) {
    const age =
      now -
      entry.createdTimestamp;


    /*
     * 이번 삭제와 관계없는
     * 오래된 기록은 제외합니다.
     *
     * 감사로그가 약간 늦게 올라오는 경우를
     * 고려해 15초 범위로 확인합니다.
     */
    if (
      age < 0 ||
      age > 15000
    ) {
      continue;
    }


    /*
     * 삭제가 발생한 채널 확인
     */
    const auditChannelId =
      entry.extra?.channel?.id ||
      entry.extra?.channelId ||
      null;


    if (
      auditChannelId &&
      auditChannelId !==
        channelId
    ) {
      continue;
    }


    /*
     * Discord MESSAGE_DELETE 감사로그의 target은
     * 삭제된 메시지의 작성자입니다.
     *
     * 희낙이 구인글은 희낙이가 작성하므로
     * target이 희낙이인지 확인합니다.
     */
    const targetId =
      entry.target?.id ||
      entry.targetId ||
      null;


    if (
      targetId &&
      targetId !==
        client.user.id
    ) {
      continue;
    }


    /*
     * executor가 실제 삭제를 실행한 사용자입니다.
     */
    const executorId =
      entry.executor?.id ||
      entry.executorId ||
      null;


    if (
      executorId
    ) {
      return executorId;
    }
  }


  return null;
}


/*
 * 실제 삭제자 확인
 *
 * 메시지 삭제 이벤트가 먼저 오고
 * 감사로그가 몇백 ms ~ 몇 초 늦게
 * 등록되는 경우가 있으므로
 *
 * 최대 4번 재확인합니다.
 */
async function findDeletedByUserId(
  guild,
  client,
  channelId
) {
  /*
   * 첫 시도 전에 약간 기다립니다.
   */
  await sleep(
    800
  );


  const MAX_ATTEMPTS =
    4;


  for (
    let attempt = 1;
    attempt <= MAX_ATTEMPTS;
    attempt += 1
  ) {
    try {
      const deletedByUserId =
        await findDeletedByUserIdOnce(
          guild,
          client,
          channelId
        );


      if (
        deletedByUserId
      ) {
        console.log(
          `👮 [구인삭제] 삭제자 확인 성공 · ${deletedByUserId} · ${attempt}차 시도`
        );


        return deletedByUserId;
      }


    } catch (error) {
      console.warn(
        `⚠️ 구인 삭제자 감사로그 확인 실패 (${attempt}/${MAX_ATTEMPTS}):`,
        error.message
      );


      /*
       * 권한 자체가 없는 경우에도
       * 삭제 기록은 계속 남겨야 하므로
       * 예외를 밖으로 던지지 않습니다.
       */
    }


    /*
     * 마지막 시도가 아니라면
     * 조금 기다린 뒤 다시 확인
     */
    if (
      attempt <
      MAX_ATTEMPTS
    ) {
      await sleep(
        800
      );
    }
  }


  console.log(
    'ℹ️ [구인삭제] 감사로그에서 삭제자를 확인하지 못했습니다.'
  );


  return null;
}


/*
 * 자리알림 신청자에게
 * 구인글 삭제로 알림이 종료됐음을 안내합니다.
 */
async function notifyDeletedRecruitmentWatchers(
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
          '🗑️ **희희낙락 자리알림 종료 안내**',
          '',
          '신청하신 구인글이 삭제되어',
          '자리알림이 자동으로 종료되었습니다.',
          '',
          `🎮 ${getRecruitmentTitle(recruitment, false)}`,
          `🔊 ${getVoiceRoomLabel(recruitment)}`,
          `🕘 시작 예정 ${recruitment.start_time}`,
        ].join('\n')
      );

    } catch (error) {
      console.warn(
        `⚠️ 구인 삭제 안내 DM 실패: ${userId}`,
        error.message
      );
    }
  }
}


/*
 * 운영진 #파티삭제 채널에
 * 삭제 기록을 남깁니다.
 */
async function sendRecruitDeleteLog(
  client,
  result,
  deletedByUserId
) {
  const recruitment =
    result.recruitment;


  try {
    const logChannel =
      await client.channels.fetch(
        LOG_CHANNEL_IDS.RECRUIT_DELETE
      );


    if (
      !logChannel ||
      !logChannel.isTextBased()
    ) {
      console.warn(
        '⚠️ 파티삭제 로그 채널을 찾을 수 없습니다.'
      );


      return;
    }


    const title =
      getRecruitmentTitle(
        recruitment,
        false
      );


    const voiceRoom =
      getVoiceRoomLabel(
        recruitment
      );


    const deletedByText =
      deletedByUserId
        ? `<@${deletedByUserId}>`
        : '확인 불가';


    const descriptionText =
      recruitment.description
        ? recruitment.description
        : '작성된 설명 없음';


    const gameNameText =
      recruitment.game_name
        ? `🎲 **종겜:** ${recruitment.game_name}`
        : null;


    const lines = [
      `👤 **구인 생성자:** <@${recruitment.creator_id}>`,
      `👮 **삭제자:** ${deletedByText}`,
      '',
      `🎮 **구인 종류:** ${title}`,
      `🔊 **음성방:** ${voiceRoom}`,
      `🕘 **시작 예정:** ${recruitment.start_time}`,
      `📝 **파티 설명:** ${descriptionText}`,
    ];


    if (
      gameNameText
    ) {
      lines.push(
        gameNameText
      );
    }


    lines.push(
      '',
      '🗑️ **구인 메시지가 삭제되었습니다.**',
      '',
      `📌 **해당 생성자의 누적 구인글 삭제 기록: ${result.deleteCount}회**`,
      '',
      '⚠️ **운영진 확인 필요**',
      '구인글 직접 삭제는 운영 규정에 따라 확인이 필요할 수 있습니다.',
      '',
      `구인 ID: #${recruitment.id}`
    );


    const embed =
      new EmbedBuilder()
        .setTitle(
          '🚨 구인글 삭제 감지'
        )
        .setDescription(
          lines.join('\n')
        )
        .setTimestamp(
          new Date()
        );


    await logChannel.send({
      embeds:
        [embed],

      /*
       * @표시는 하지만
       * 실제 멘션 알림은 발생하지 않습니다.
       */
      allowedMentions: {
        parse: [],
      },
    });


  } catch (error) {
    console.error(
      '❌ 파티삭제 로그 전송 실패:',
      error
    );
  }
}


/*
 * 실제 messageDelete 이벤트 처리
 */
async function handleRecruitmentMessageDelete(
  client,
  message
) {
  try {
    const guildId =
      message.guildId ||
      message.guild?.id ||
      message.channel?.guild?.id ||
      null;


    if (
      !guildId ||
      !message.id
    ) {
      return;
    }


    /*
     * DB에 등록된
     * 희낙이 구인글인지 확인
     */
    const recruitment =
      getRecruitmentByDeletedMessage(
        guildId,
        message.id
      );


    /*
     * 일반 채팅 삭제는 무시
     */
    if (!recruitment) {
      return;
    }


    /*
     * 이미 처리한 구인은
     * 중복 기록하지 않습니다.
     */
    if (
      recruitment.status ===
      'DELETED'
    ) {
      return;
    }


    let guild =
      message.guild ||
      client.guilds.cache.get(
        guildId
      );


    if (!guild) {
      try {
        guild =
          await client.guilds.fetch(
            guildId
          );

      } catch (error) {
        console.warn(
          '⚠️ 구인 삭제 길드 조회 실패:',
          error.message
        );
      }
    }


    /*
     * 감사로그가 등록될 시간을 기다리면서
     * 실제 삭제자를 최대 4번 확인합니다.
     */
    let deletedByUserId =
      null;


    if (guild) {
      deletedByUserId =
        await findDeletedByUserId(
          guild,
          client,
          recruitment.channel_id
        );
    }


    /*
     * DB 기록
     * + 구인 DELETED 처리
     * + 자리알림 종료
     */
    const result =
      recordRecruitmentDeletion(
        recruitment,
        deletedByUserId
      );


    if (
      result.code !==
      'RECORDED'
    ) {
      return;
    }


    /*
     * 자리알림 대기자들에게
     * 자동 종료 안내
     */
    await notifyDeletedRecruitmentWatchers(
      client,
      result.watcherIds,
      recruitment
    );


    /*
     * 운영진 #파티삭제 로그
     */
    await sendRecruitDeleteLog(
      client,
      result,
      deletedByUserId
    );


    console.log(
      [
        '🗑️ [구인삭제]',
        `구인 ${recruitment.id}`,
        `생성자 ${recruitment.creator_id}`,
        `삭제자 ${deletedByUserId || '확인불가'}`,
        `누적 ${result.deleteCount}회`,
      ].join(' · ')
    );

  } catch (error) {
    console.error(
      '❌ 구인글 삭제 감지 처리 오류:',
      error
    );
  }
}


module.exports = {
  handleRecruitmentMessageDelete,
};