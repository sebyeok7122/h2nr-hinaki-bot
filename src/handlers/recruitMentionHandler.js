
const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');

const {
  ROLE_IDS,
  RECRUIT_CONFIG
} = require('../config/constants');

const {
  getMentionSetupSession,
  updateSetupSession
} = require('../services/recruitSetupService');


/*
 * 동일 사용자의 중복 입력 처리 방지
 */
const processingSessions = new Set();


function getRoomConfig(voiceKind) {
  switch (voiceKind) {
    case 'DUO':
      return {
        label: '듀오',
        maxRooms: RECRUIT_CONFIG.DUO_ROOMS
      };

    case 'OTHER_GAME':
      return {
        label: '종겜',
        maxRooms: RECRUIT_CONFIG.OTHER_GAME_ROOMS
      };

    case 'MERCENARY':
      return {
        label: '용병',
        maxRooms: RECRUIT_CONFIG.MERCENARY_ROOMS
      };

    default:
      return {
        label: '스쿼드',
        maxRooms: RECRUIT_CONFIG.SQUAD_ROOMS
      };
  }
}


function buildRoomSelect(voiceKind) {
  const config = getRoomConfig(voiceKind);
  const options = [];

  for (let room = 1; room <= config.maxRooms; room++) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(`${config.label} ${room}번방`)
        .setValue(String(room))
    );
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId('recruit_setup_room')
    .setPlaceholder(`${config.label}방을 선택해주세요`)
    .addOptions(options);

  return new ActionRowBuilder()
    .addComponents(menu);
}


/*
 * 슬래시 명령어의 개인 안내 화면 갱신
 */
async function updatePrivateSetup(
  session,
  content,
  components = []
) {
  const interaction = session.sourceInteraction;

  if (
    !interaction ||
    typeof interaction.editReply !== 'function'
  ) {
    console.warn(
      '⚠️ 구인 설정 원본 interaction 없음'
    );

    return false;
  }

  await interaction.editReply({
    content,
    components,
    allowedMentions: {
      parse: []
    }
  });

  return true;
}


/*
 * 멤버 등록 성공 시
 * 구인 채널에 입력한 멘션 메시지를 정리합니다.
 *
 * Manage Messages 권한이 없다면
 * 오류만 기록하고 구인 생성은 계속 진행합니다.
 */
async function deleteMentionMessage(message) {
  try {
    if (!message.deleted) {
      await message.delete();
    }

    console.log(
      `🧹 [구인멘션] 입력 메시지 정리 완료 · ${message.id}`
    );

  } catch (error) {
    console.warn(
      '⚠️ 구인 멘션 메시지 삭제 실패 (메시지 관리 권한 확인):',
      error.message
    );
  }
}


/*
 * 사용자가 직접 입력한 멘션 처리
 *
 * 예:
 * @새벽 @상디 @혜진
 */
async function handleRecruitMentionMessage(message) {
  if (
    !message.inGuild() ||
    message.author.bot
  ) {
    return false;
  }

  const session = getMentionSetupSession(
    message.guildId,
    message.author.id,
    message.channelId
  );

  if (!session) {
    return false;
  }

  /*
   * 일반 대화 중 멘션은 무시합니다.
   * 멘션만 입력한 메시지만 인식합니다.
   */
  const mentionOnly =
    /^(?:\s*<@!?\d{16,22}>\s*)+$/;

  if (
    !mentionOnly.test(message.content.trim())
  ) {
    return false;
  }

  const memberIds = [
    ...new Set(message.mentions.users.keys())
  ];

  if (memberIds.length === 0) {
    return false;
  }

  const key =
    `${message.guildId}:${message.author.id}`;

  if (processingSessions.has(key)) {
    return true;
  }

  processingSessions.add(key);

  try {
    /*
     * 정원 초과 검사
     */
    if (memberIds.length > session.capacity) {
      await updatePrivateSetup(
        session,
        `❎ 선택한 멤버가 ${memberIds.length}명인데 정원은 ${session.capacity}명이에요.\n\n` +
        '정원에 맞게 다시 멘션해주세요.'
      );

      return true;
    }

    const newbieMemberIds = [];
    let hasMercenary = false;

    /*
     * 서버 멤버 및 역할 검사
     */
    for (const userId of memberIds) {
      let member;

      try {
        member =
          await message.guild.members.fetch(userId);

      } catch {
        await updatePrivateSetup(
          session,
          `❎ <@${userId}> 님의 서버 정보를 확인할 수 없어요.\n\n` +
          '서버에 있는 멤버를 다시 멘션해주세요.'
        );

        return true;
      }

      if (member.user.bot) {
        await updatePrivateSetup(
          session,
          '❎ 봇 계정은 파티 멤버로 등록할 수 없어요.\n\n' +
          '멤버를 다시 멘션해주세요.'
        );

        return true;
      }

      if (
        member.roles.cache.has(ROLE_IDS.NEWBIE)
      ) {
        newbieMemberIds.push(userId);
      }

      if (
        member.roles.cache.has(ROLE_IDS.MERCENARY)
      ) {
        hasMercenary = true;
      }
    }

    /*
     * 신입파티 조건
     */
    if (
      session.type === 'NEWBIE' &&
      newbieMemberIds.length === 0
    ) {
      await updatePrivateSetup(
        session,
        '🌱 신입 파티에는 신입 역할을 가진 멤버가 최소 1명 필요해요.\n\n' +
        '신입 멤버를 포함해서 다시 멘션해주세요.'
      );

      return true;
    }

    /*
     * 용병구인 조건
     */
    if (
      session.type === 'MERCENARY' &&
      !hasMercenary
    ) {
      await updatePrivateSetup(
        session,
        '🪖 용병구인에는 용병 역할을 가진 멤버가 최소 1명 필요해요.\n\n' +
        '용병 멤버를 포함해서 다시 멘션해주세요.'
      );

      return true;
    }

    const { label } =
      getRoomConfig(session.voiceKind);

    const mentions =
      memberIds
        .map((id) => `<@${id}>`)
        .join(' ');

    /*
     * 개인 설정 화면을 방 선택 단계로 변경
     */
    const updated = await updatePrivateSetup(
      session,
      '👥 **멤버 등록 완료!**\n\n' +
      `✅ 현재 멤버: ${mentions}\n` +
      `👥 현재 인원: ${memberIds.length} / ${session.capacity}명\n\n` +
      `🔊 사용할 **${label}방**을 선택해주세요.`,
      [buildRoomSelect(session.voiceKind)]
    );

    if (!updated) {
      return true;
    }

    /*
     * 멤버 등록 및 다음 단계 저장
     */
    updateSetupSession(
      message.guildId,
      message.author.id,
      {
        memberIds,
        newbieMemberIds:
          session.type === 'NEWBIE'
            ? newbieMemberIds
            : [],
        step: 'AWAITING_ROOM'
      }
    );

    /*
     * 등록 성공한 멘션 메시지만 삭제
     *
     * 일반 채팅이나 조건 검사에 실패한
     * 메시지는 삭제하지 않습니다.
     */
    await deleteMentionMessage(message);

    console.log(
      `👥 [구인멘션] ${message.author.id} · ${memberIds.length}명 등록`
    );

    return true;

  } catch (error) {
    console.error(
      '❌ 구인 멘션 처리 오류:',
      error
    );

    return true;

  } finally {
    processingSessions.delete(key);
  }
}


module.exports = {
  handleRecruitMentionMessage
};