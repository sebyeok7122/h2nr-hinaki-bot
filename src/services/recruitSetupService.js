
const setupSessions = new Map();

const SESSION_TTL_MS =
  10 * 60 * 1000;


function getKey(guildId, userId) {
  return `${guildId}:${userId}`;
}


/*
 * 구인 생성 세션
 *
 * 멤버 멘션 입력
 * → 음성방 선택
 * → 파티 설명 작성
 * → 구인 생성
 */
function createSetupSession({
  guildId,
  userId,
  type,
  capacity,
  voiceKind,
  channelId = null,
  sourceInteraction = null,
  gameName = null,
}) {
  const key = getKey(guildId, userId);

  const session = {
    guildId,
    userId,
    type,
    capacity,
    voiceKind,
    channelId,
    sourceInteraction,
    gameName,

    step: 'AWAITING_MEMBERS',

    memberIds: [],
    newbieMemberIds: [],
    roomNumber: null,

    // 기존 코드와의 호환을 위해 유지합니다.
    hour: null,
    minute: null,

    createdAt: Date.now(),
  };

  setupSessions.set(key, session);

  /*
   * 10분 뒤 미완료 세션을 자동 정리합니다.
   * 같은 사용자가 새 구인을 시작했다면
   * 이전 타이머가 새 세션을 삭제하지 않습니다.
   */
  const timer = setTimeout(() => {
    if (setupSessions.get(key) === session) {
      setupSessions.delete(key);
    }
  }, SESSION_TTL_MS);

  timer.unref?.();

  return session;
}


function getSetupSession(guildId, userId) {
  const key = getKey(guildId, userId);
  const session = setupSessions.get(key);

  if (!session) {
    return null;
  }

  if (
    Date.now() - session.createdAt >
    SESSION_TTL_MS
  ) {
    setupSessions.delete(key);
    return null;
  }

  return session;
}


/*
 * 일반 채팅에서 입력한 멘션이
 * 현재 진행 중인 구인 설정에 해당하는지 확인합니다.
 */
function getMentionSetupSession(
  guildId,
  userId,
  channelId
) {
  const session = getSetupSession(
    guildId,
    userId
  );

  if (
    !session ||
    session.step !== 'AWAITING_MEMBERS' ||
    session.channelId !== channelId
  ) {
    return null;
  }

  return session;
}


function updateSetupSession(
  guildId,
  userId,
  values
) {
  const session = getSetupSession(
    guildId,
    userId
  );

  if (!session) {
    return null;
  }

  Object.assign(session, values);

  return session;
}


function deleteSetupSession(
  guildId,
  userId
) {
  setupSessions.delete(
    getKey(guildId, userId)
  );
}


module.exports = {
  createSetupSession,
  getSetupSession,
  getMentionSetupSession,
  updateSetupSession,
  deleteSetupSession,
};