const setupSessions = new Map();

const SESSION_TTL_MS = 15 * 60 * 1000;

function getKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function createSetupSession({
  guildId,
  userId,
  type,
  capacity,
  voiceKind
}) {
  const key = getKey(
    guildId,
    userId
  );

  const session = {
    guildId,
    userId,
    type,
    capacity,
    voiceKind,

    memberIds: [],
    hour: null,
    minute: null,
    roomNumber: null,

    createdAt: Date.now(),
  };

  setupSessions.set(
    key,
    session
  );

  return session;
}

function getSetupSession(
  guildId,
  userId
) {
  const key = getKey(
    guildId,
    userId
  );

  const session =
    setupSessions.get(key);

  if (!session) {
    return null;
  }

  const expired =
    Date.now() - session.createdAt >
    SESSION_TTL_MS;

  if (expired) {
    setupSessions.delete(key);
    return null;
  }

  return session;
}

function updateSetupSession(
  guildId,
  userId,
  values
) {
  const session =
    getSetupSession(
      guildId,
      userId
    );

  if (!session) {
    return null;
  }

  Object.assign(
    session,
    values
  );

  return session;
}

function deleteSetupSession(
  guildId,
  userId
) {
  setupSessions.delete(
    getKey(
      guildId,
      userId
    )
  );
}

module.exports = {
  createSetupSession,
  getSetupSession,
  updateSetupSession,
  deleteSetupSession,
};