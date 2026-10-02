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
  if (
    !party.isActuallyFull ||
    party.memberIds.length !==
      party.capacity
  ) {
    return false;
  }


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


async function getDisplayName(
  guild,
  userId
) {
  try {
    const member =
      guild.members.cache.get(
        userId
      ) ||
      await guild.members.fetch(
        userId
      );


    return (
      member.nickname ||
      member.displayName ||
      member.user.username ||
      userId
    );

  } catch (error) {
    return userId;
  }
}


async function getPartyMemberNames(
  guild,
  party
) {
  const names = [];


  for (
    const userId of party.memberIds
  ) {
    names.push(
      await getDisplayName(
        guild,
        userId
      )
    );
  }


  return names;
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
       * 가지고 있는 사람은 +3P 대상에서 제외합니다.
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
  dailyLimitUserIds,
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


    const dailyLimitLines =
      dailyLimitUserIds.map(
        (userId) =>
          `<@${userId}> 오늘 신입활동 1회 이미 인정됨`
      );


    const messageLines = [
      '💚 **신입 파티 활동 완료**',
      '',
    ];


    if (
      pointLines.length > 0
    ) {
      messageLines.push(
        ...pointLines
      );
    }


    if (
      dailyLimitLines.length > 0
    ) {
      if (
        pointLines.length > 0
      ) {
        messageLines.push('');
      }


      messageLines.push(
        '🌱 **오늘 신입활동 인정 횟수를 이미 사용한 멤버**',
        ...dailyLimitLines
      );
    }


    if (
      pointLines.length === 0 &&
      dailyLimitLines.length === 0
    ) {
      messageLines.push(
        '이번 파티는 추가 포인트 지급 대상이 없습니다.'
      );
    }


    messageLines.push(
      '',
      '신입활동 보상은 **1인당 하루 1회**만 적용됩니다.',
      '신입과 함께해주셔서 감사합니다! 🌱'
    );


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
   * 참가자 전원이 지정 음성방에 없다면
   * 활동 카운트를 즉시 정지합니다.
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
   * 전원이 지정방에 모였으면
   * 카운트를 시작하거나 재개합니다.
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


    const memberNames =
      await getPartyMemberNames(
        guild,
        party
      );


    if (
      wasResume
    ) {
      console.log(
        `▶️ [신입활동 재개] 구인 #${party.recruitmentId} · ${party.voiceKind} ${party.voiceRoomNumber}번방 · 누적 ${formatSeconds(startResult.progress.accumulatedSeconds)} · 참가자 ${memberNames.join(' / ')}`
      );

    } else {
      console.log(
        `🌱 [신입활동 시작] 구인 #${party.recruitmentId} · ${party.voiceKind} ${party.voiceRoomNumber}번방 · 참가자 ${memberNames.join(' / ')}`
      );
    }
  }


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
   * 60분 목표 달성.
   *
   * 현재 [신입] 역할이 없는 기존 멤버 중
   * 오늘 아직 신입활동을 인정받지 않은 사람에게만
   * 활동 1회 +3P가 적용됩니다.
   *
   * 같은 신입인지 다른 신입인지는 관계없이
   * 멤버별 하루 최대 1회입니다.
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


  if (
    completeResult.code !==
    'COMPLETED'
  ) {
    return;
  }


  const awardedNames = [];


  for (
    const userId of
      completeResult.awardedUserIds
  ) {
    const name =
      await getDisplayName(
        guild,
        userId
      );


    awardedNames.push(
      `${name} +${completeResult.pointsEach}P`
    );
  }


  const dailyLimitNames = [];


  for (
    const userId of
      completeResult.dailyLimitUserIds || []
  ) {
    const name =
      await getDisplayName(
        guild,
        userId
      );


    dailyLimitNames.push(
      name
    );
  }


  const pointLog =
    awardedNames.length > 0
      ? awardedNames.join(' / ')
      : '지급 대상 없음';


  const dailyLimitLog =
    dailyLimitNames.length > 0
      ? ` · 하루 1회 제한 제외: ${dailyLimitNames.join(' / ')}`
      : '';


  console.log(
    `💚 [신입활동 완료] 구인 #${party.recruitmentId} · ${formatSeconds(completeResult.progress?.totalSeconds)} · 포인트 지급: ${pointLog}${dailyLimitLog}`
  );


  await sendCompletionMessage(
    guild,
    party,
    completeResult.awardedUserIds,
    completeResult.dailyLimitUserIds || [],
    completeResult.pointsEach
  );
}


async function checkAllNewbieParties(
  client
) {
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
   * 음소거 / 카메라 / 화면공유 변경 등
   * 실제 음성방 이동이 아닌 이벤트는 무시합니다.
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


  /*
   * 서버 전체 음성 입장/퇴장/이동 로그는
   * 출력하지 않습니다.
   *
   * 현재 진행 중인 신입파티에 참가 중인
   * 멤버의 변화만 활동 판정에 사용합니다.
   */
  const parties =
    getActiveNewbiePartiesForMember(
      guild.id,
      member.id
    );


  /*
   * 신입파티와 아무 관련 없는 멤버라면
   * 여기서 끝냅니다.
   */
  if (
    parties.length === 0
  ) {
    return;
  }


  /*
   * 해당 멤버가 참가 중인 신입파티만
   * 즉시 재검사합니다.
   */
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