const {
  db
} = require('../database/db');

const insertRecruitment = db.prepare(`
  INSERT INTO recruitments (
    guild_id,
    channel_id,
    type,
    creator_id,
    voice_kind,
    voice_room_number,
    capacity,
    start_time,
    status
  )
  VALUES (
    @guildId,
    @channelId,
    @type,
    @creatorId,
    @voiceKind,
    @voiceRoomNumber,
    @capacity,
    @startTime,
    @status
  )
`);

const insertMember = db.prepare(`
  INSERT INTO recruitment_members (
    recruitment_id,
    user_id,
    is_active
  )
  VALUES (?, ?, 1)
`);

const updateMessageId = db.prepare(`
  UPDATE recruitments
  SET
    message_id = ?,
    updated_at = datetime('now')
  WHERE id = ?
`);

const deleteRecruitmentStatement =
  db.prepare(`
    DELETE FROM recruitments
    WHERE id = ?
  `);

const createRecruitmentTransaction =
  db.transaction((data) => {
    const status =
      data.memberIds.length >=
      data.capacity
        ? 'FULL'
        : 'OPEN';

    const result =
      insertRecruitment.run({
        guildId: data.guildId,
        channelId: data.channelId,
        type: data.type,
        creatorId: data.creatorId,
        voiceKind: data.voiceKind,
        voiceRoomNumber:
          data.voiceRoomNumber,
        capacity: data.capacity,
        startTime: data.startTime,
        status,
      });

    const recruitmentId =
      Number(result.lastInsertRowid);

    for (
      const userId of data.memberIds
    ) {
      insertMember.run(
        recruitmentId,
        userId
      );
    }

    return {
      id: recruitmentId,
      status,
    };
  });

function createRecruitment(data) {
  return createRecruitmentTransaction(
    data
  );
}

function setRecruitmentMessageId(
  recruitmentId,
  messageId
) {
  updateMessageId.run(
    messageId,
    recruitmentId
  );
}

function deleteRecruitment(
  recruitmentId
) {
  deleteRecruitmentStatement.run(
    recruitmentId
  );
}

module.exports = {
  createRecruitment,
  setRecruitmentMessageId,
  deleteRecruitment,
};