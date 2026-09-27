const {
  VOICE_CHANNEL_IDS
} = require('../config/constants');

const {
  getFullNewbiePartiesForMember,
  getNewbiePartyProgress,
  startNewbiePartyTimer,
  pauseNewbiePartyTimer
} = require('../services/newbieActivityService');


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
   * FULL이라고 되어 있더라도
   * 실제 참가자 수가 정확히 정원인지 다시 확인합니다.
   */
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


function evaluateNewbieParty(
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


  if (allPresent) {
    const beforeProgress =
      getNewbiePartyProgress(
        party.recruitmentId
      );


    if (
      beforeProgress?.completed
    ) {
      return;
    }


    const result =
      startNewbiePartyTimer(
        party.guildId,
        party.recruitmentId
      );


    if (
      result.started
    ) {
      const wasResume =
        result.progress
          ?.accumulatedSeconds > 0;


      console.log(
        wasResume
          ? `▶️ [신입활동 재개] 구인 #${party.recruitmentId} · ${party.voiceKind} ${party.voiceRoomNumber}번방 · 누적 ${formatSeconds(result.progress.accumulatedSeconds)}`
          : `🌱 [신입활동 시작] 구인 #${party.recruitmentId} · ${party.voiceKind} ${party.voiceRoomNumber}번방`
      );
    }


    return;
  }


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
}


function handleVoiceStateUpdate(
  oldState,
  newState
) {
  const oldChannelId =
    oldState.channelId;

  const newChannelId =
    newState.channelId;


  /*
   * 음소거, 카메라 변경 등은 무시하고
   * 실제 음성채널 이동만 처리합니다.
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


  if (!member) {
    return;
  }


  if (
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
    `${member.user.username} (${member.id})`;


  /*
   * 기존 입퇴장 로그
   */
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
   * 이 사람이 참가 중인
   * FULL 신입파티만 찾아서 검사합니다.
   *
   * 관련 없는 멤버가 음성방을 이동해도
   * 신입활동 타이머에는 영향이 없습니다.
   */
  const parties =
    getFullNewbiePartiesForMember(
      guild.id,
      member.id
    );


  for (
    const party of parties
  ) {
    evaluateNewbieParty(
      guild,
      party
    );
  }
}


module.exports = {
  handleVoiceStateUpdate,
};