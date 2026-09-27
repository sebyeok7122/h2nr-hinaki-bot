function handleVoiceStateUpdate(
  oldState,
  newState
) {
  const oldChannelId =
    oldState.channelId;

  const newChannelId =
    newState.channelId;


  /*
   * 음소거/카메라 변경 같은 건 무시하고
   * 실제 음성채널 이동만 감지합니다.
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


  /*
   * 봇 계정의 음성 이동은 제외
   */
  if (
    member.user?.bot
  ) {
    return;
  }


  const userLabel =
    `${member.user.username} (${member.id})`;


  /*
   * 음성방 입장
   */
  if (
    !oldChannelId &&
    newChannelId
  ) {
    console.log(
      `🎧 [음성 입장] ${userLabel} → ${newState.channel?.name || newChannelId}`
    );

    return;
  }


  /*
   * 음성방 퇴장
   */
  if (
    oldChannelId &&
    !newChannelId
  ) {
    console.log(
      `🚪 [음성 퇴장] ${userLabel} ← ${oldState.channel?.name || oldChannelId}`
    );

    return;
  }


  /*
   * 음성방 이동
   */
  console.log(
    `🔄 [음성 이동] ${userLabel} : ` +
    `${oldState.channel?.name || oldChannelId} → ` +
    `${newState.channel?.name || newChannelId}`
  );
}


module.exports = {
  handleVoiceStateUpdate,
};