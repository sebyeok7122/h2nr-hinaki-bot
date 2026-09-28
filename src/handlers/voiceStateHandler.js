const {
  DISCORD_IDS,
  ROLE_IDS,
  VOICE_CHANNEL_IDS
} = require('../config/constants');

const {
  getActiveNewbieParties,
  getActiveNewbiePartiesForMember,

  getNewbiePartyProgress,
  startNewbiePartyTimer,
  pauseNewbiePartyTimer,

  completeNewbieParty
} = require('../services/newbieActivityService');


let checkingAllParties = false;


function formatSeconds(
  totalSeconds
) {
  const safeSeconds =
    Math.max(
      Number(totalSeconds) || 0,
      0
    );

  const minutes =
    Math.floor(
      safeSeconds / 60
    );

  const seconds =
    safeSeconds % 60;

  return (
    `${String(minutes).padStart(2, '0')}분 ` +
    `${String(seconds).padStart(2, '0')}초`
  );
}


function getTargetChannelId(
  party
) {
  const channelGroup =
    VOICE_CHANNEL_IDS[
      party.voiceKind
    ];

  if (!channelGroup) {
    return null;
  }

  return (
    channelGroup[
      party.voiceRoomNumber
    ] || null
  );
}


function areAllPartyMembersInTargetChannel(
  guild,
  party,
  targetChannelId
) {
  /*
   * FULL + 실제 참가자 수가 정원과
   * 정확히 같아야 합니다.
   */
  if (
    !party.isActuallyFull ||
    party.memberIds.length !==
      party.capacity
  ) {
    return false;
  }


  /*
   * 구인 참가자 전원이
   * 지정 음성방에 있어야 합니다.
   *
   * 관계없는 다른 사람이 방에 있는 것은
   * 상관없습니다.
   */
  return party.memberIds.every(
    (userId) => {
      const voiceState =
        guild.voiceStates.cache.get(
          userId
        );

      return (
        voiceState?.channelId ===
        targetChannelId
      );
    }
  );
}


async function getHelperUserIds(
  guild,
  party
) {
  const helperUserIds = [];


  for (
    const userId of party.memberIds
  ) {
    try {
      const member =
        guild.members.cache.get(
          userId
        ) ||
        await guild.members.fetch(
          userId
        );


      /*
       * 완료 시점에도 [신입] 역할을
       * 가진 사람은 +3P 대상에서 제외합니다.
       */
      if (
        member.roles.cache.has(
          ROLE_IDS.NEWBIE
        )
      ) {
        continue;
      }


      helperUserIds.push(
        userId
      );

    } catch (error) {
      console.warn(
        `⚠️ [신입활동] 멤버 ${userId} 정보를 확인하지 못했습니다.`
      );
    }
  }


  return helperUserIds;
}


async function sendCompletionMessage(
  guild,
  party,
  awardedUserIds,
  pointsEach
) {
  try {
    const channel =
      guild.channels.cache.get(
        party.channelId
      ) ||
      await guild.channels.fetch(
        party.channelId
      );


    if (
      !channel ||
      !channel.isTextBased()
    ) {
      console.warn(
        `⚠️ [신입활동] 구인 #${party.recruitmentId} 완료 메시지를 보낼 채널을 찾지 못했습니다.`
      );

      return;
    }


    const pointLines =
      awardedUserIds.map(
        (userId) =>
          `<@${userId}> +${pointsEach}P`
      );


    const messageLines = [
      '💚 **신입 파티 활동 완료**',
      '',
      ...pointLines,
      '',
      '신입과 함께해주셔서 감사합니다! 🌱',
    ];


    await channel.send({
      content:
        messageLines.join('\n'),

      allowedMentions: {
        users:
          awardedUserIds,
      },
    });


  } catch (error) {
    console.error(
      `❌ [신입활동] 구인 #${party.recruitmentId} 완료 메시지 전송 실패:`,
      error
    );
  }
}


async function evaluateNewbieParty(
  guild,
  party
) {
  const targetChannelId =
    getTargetChannelId(
      party
    );


  if (!targetChannelId) {
    console.warn(
      `⚠️ [신입활동] 구인 #${party.recruitmentId}의 음성채널 ID를 찾을 수 없습니다.`
    );

    return;
  }


  const allPresent =
    areAllPartyMembersInTargetChannel(
      guild,
      party,
      targetChannelId
    );


  /*
   * FULL이 아니거나
   * 참가자 전원이 지정방에 없으면
   * 즉시 카운트를 정지합니다.
   */
  if (!allPresent) {
    const result =
      pauseNewbiePartyTimer(
        party.recruitmentId
      );


    if (
      result.paused
    ) {
      console.log(
        `⏸️ [신입활동 정지] 구인 #${party.recruitmentId} · 누적 ${formatSeconds(result.progress?.totalSeconds)}`
      );
    }


    return;
  }


  const beforeProgress =
    getNewbiePartyProgress(
      party.recruitmentId
    );


  if (
    beforeProgress?.completed
  ) {
    return;
  }


  /*
   * 전원이 모였으면
   * 아직 카운트 중이 아닐 때 시작/재개합니다.
   */
  const startResult =
    startNewbiePartyTimer(
      party.guildId,
      party.recruitmentId
    );


  if (
    startResult.started
  ) {
    const wasResume =
      startResult.progress
        ?.accumulatedSeconds > 0;


    console.log(
      wasResume
        ? `▶️ [신입활동 재개] 구인 #${party.recruitmentId} · ${party.voiceKind} ${party.voiceRoomNumber}번방 · 누적 ${formatSeconds(startResult.progress.accumulatedSeconds)}`
        : `🌱 [신입활동 시작] 구인 #${party.recruitmentId} · ${party.voiceKind} ${party.voiceRoomNumber}번방`
    );
  }


  /*
   * 현재 시점의 누적시간을 다시 계산합니다.
   */
  const progress =
    getNewbiePartyProgress(
      party.recruitmentId
    );


  if (
    !progress ||
    !progress.reachedGoal ||
    progress.completed
  ) {
    return;
  }


  /*
   * 목표시간 달성!
   *
   * 현재 [신입] 역할을 가진 사람은 제외하고
   * 기존 멤버만 +3P 대상으로 정합니다.
   */
  const helperUserIds =
    await getHelperUserIds(
      guild,
      party
    );


  const completeResult =
    completeNewbieParty(
      party.guildId,
      party.recruitmentId,
      helperUserIds
    );


  /*
   * 이미 다른 검사에서 완료했다면
   * 아무것도 하지 않습니다.
   */
  if (
    completeResult.code !==
    'COMPLETED'
  ) {
    return;
  }


  console.log(
    `💚 [신입활동 완료] 구인 #${party.recruitmentId} · ${formatSeconds(completeResult.progress?.totalSeconds)} · ${completeResult.awardedUserIds.length}명 지급`
  );


  await sendCompletionMessage(
    guild,
    party,
    completeResult.awardedUserIds,
    completeResult.pointsEach
  );
}


async function checkAllNewbieParties(
  client
) {
  /*
   * 5초마다 검사할 예정이라
   * 이전 검사가 아직 끝나지 않았다면
   * 중복 실행하지 않습니다.
   */
  if (
    checkingAllParties
  ) {
    return;
  }


  checkingAllParties = true;


  try {
    const guild =
      client.guilds.cache.get(
        DISCORD_IDS.GUILD_ID
      ) ||
      await client.guilds.fetch(
        DISCORD_IDS.GUILD_ID
      );


    if (!guild) {
      return;
    }


    const parties =
      getActiveNewbieParties(
        guild.id
      );


    for (
      const party of parties
    ) {
      await evaluateNewbieParty(
        guild,
        party
      );
    }

  } catch (error) {
    console.error(
      '❌ [신입활동] 전체 파티 검사 오류:',
      error
    );

  } finally {
    checkingAllParties = false;
  }
}


async function handleVoiceStateUpdate(
  oldState,
  newState
) {
  const oldChannelId =
    oldState.channelId;

  const newChannelId =
    newState.channelId;


  /*
   * 음소거/카메라 변경 등은 무시합니다.
   */
  if (
    oldChannelId ===
    newChannelId
  ) {
    return;
  }


  const member =
    newState.member ||
    oldState.member;


  if (
    !member ||
    member.user?.bot
  ) {
    return;
  }


  const guild =
    newState.guild ||
    oldState.guild;


  if (!guild) {
    return;
  }


const userLabel =
  `${member.nickname || member.displayName} (${member.id})`;


  if (
    !oldChannelId &&
    newChannelId
  ) {
    console.log(
      `🎧 [음성 입장] ${userLabel} → ${newState.channel?.name || newChannelId}`
    );

  } else if (
    oldChannelId &&
    !newChannelId
  ) {
    console.log(
      `🚪 [음성 퇴장] ${userLabel} ← ${oldState.channel?.name || oldChannelId}`
    );

  } else {
    console.log(
      `🔄 [음성 이동] ${userLabel} : ` +
      `${oldState.channel?.name || oldChannelId} → ` +
      `${newState.channel?.name || newChannelId}`
    );
  }


  /*
   * 이 사람이 현재 참가 중인
   * 신입파티만 즉시 재검사합니다.
   */
  const parties =
    getActiveNewbiePartiesForMember(
      guild.id,
      member.id
    );


  for (
    const party of parties
  ) {
    await evaluateNewbieParty(
      guild,
      party
    );
  }
}


module.exports = {
  handleVoiceStateUpdate,
  checkAllNewbieParties,
};