const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');

const {
  getSetupSession,
  updateSetupSession,
  deleteSetupSession
} = require('../services/recruitSetupService');

const {
  createRecruitment,
  getRecruitmentSnapshot,
  setRecruitmentMessageId,
  deleteRecruitment
} = require('../services/recruitService');

const {
  buildRecruitmentMessage,
  getMentionList
} = require('../ui/recruitMessageBuilder');


const SETUP_TITLES = {
  GENERAL:
    '🎮 일반게임 구인',

  RANKED:
    '🏆 경쟁전 구인',

  GENERAL_HARD:
    '🔥 일반 빡겜 구인',

  RANKED_HARD:
    '🔥🏆 경쟁 빡겜 구인',

  NEWBIE:
    '🌱 신입 파티 구해요!',

  DUO:
    '💕 듀오 구인',

  OTHER_GAME:
    '🎮 종겜 구인',

  MERCENARY:
    '🪖 용병 구인',
};


const COMPLETE_TITLES = {
  GENERAL:
    '일반게임 구인',

  RANKED:
    '경쟁전 구인',

  GENERAL_HARD:
    '일반 빡겜 구인',

  RANKED_HARD:
    '경쟁 빡겜 구인',

  NEWBIE:
    '신입 파티',

  DUO:
    '듀오 구인',

  OTHER_GAME:
    '종겜 구인',

  MERCENARY:
    '용병 구인',
};


function getSetupTitle(type) {
  return (
    SETUP_TITLES[type] ||
    SETUP_TITLES.GENERAL
  );
}


function getCompleteTitle(type) {
  return (
    COMPLETE_TITLES[type] ||
    COMPLETE_TITLES.GENERAL
  );
}


function getVoiceRoomConfig(
  voiceKind
) {
  if (voiceKind === 'DUO') {
    return {
      label: '듀오',
      maxRooms: 4,
    };
  }

  if (
    voiceKind ===
    'OTHER_GAME'
  ) {
    return {
      label: '종겜',
      maxRooms: 8,
    };
  }

  if (
    voiceKind ===
    'MERCENARY'
  ) {
    return {
      label: '용병',
      maxRooms: 3,
    };
  }

  return {
    label: '스쿼드',
    maxRooms: 13,
  };
}


function buildHourOptions() {
  const options = [];

  for (
    let hour = 0;
    hour < 24;
    hour += 1
  ) {
    const value =
      String(hour).padStart(
        2,
        '0'
      );

    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(`${value}시`)
        .setValue(value)
    );
  }

  return options;
}


function buildMinuteOptions() {
  return [
    '00',
    '10',
    '20',
    '30',
    '40',
    '50',
  ].map(
    (minute) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`${minute}분`)
        .setValue(minute)
  );
}


function buildRoomOptions(
  voiceKind
) {
  const {
    label,
    maxRooms,
  } = getVoiceRoomConfig(
    voiceKind
  );

  const options = [];

  for (
    let room = 1;
    room <= maxRooms;
    room += 1
  ) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(
          `${label} ${room}번방`
        )
        .setValue(
          String(room)
        )
    );
  }

  return options;
}


async function handleRecruitSetupInteraction(
  interaction
) {
  if (
    interaction.isUserSelectMenu() &&
    interaction.customId ===
      'recruit_setup_members'
  ) {
    const session =
      getSetupSession(
        interaction.guildId,
        interaction.user.id
      );

    if (!session) {
      await interaction.reply({
        content:
          '⏰ 구인 설정 시간이 만료됐어요. 다시 명령어를 실행해주세요.',
        ephemeral: true,
      });

      return true;
    }

    updateSetupSession(
      interaction.guildId,
      interaction.user.id,
      {
        memberIds:
          interaction.values,
      }
    );

    const hourSelect =
      new StringSelectMenuBuilder()
        .setCustomId(
          'recruit_setup_hour'
        )
        .setPlaceholder(
          '시작 예정 시간을 선택해주세요'
        )
        .addOptions(
          buildHourOptions()
        );

    const row =
      new ActionRowBuilder()
        .addComponents(
          hourSelect
        );

    await interaction.update({
      content:
        `${getSetupTitle(session.type)} **설정**\n\n` +
        `✅ 현재 멤버: ${getMentionList(interaction.values)}\n\n` +
        '② 시작 예정 **시간**을 선택해주세요.',

      components: [row],
    });

    return true;
  }


  if (
    interaction.isStringSelectMenu() &&
    interaction.customId ===
      'recruit_setup_hour'
  ) {
    const session =
      getSetupSession(
        interaction.guildId,
        interaction.user.id
      );

    if (!session) {
      await interaction.reply({
        content:
          '⏰ 구인 설정 시간이 만료됐어요. 다시 명령어를 실행해주세요.',
        ephemeral: true,
      });

      return true;
    }

    const hour =
      interaction.values[0];

    updateSetupSession(
      interaction.guildId,
      interaction.user.id,
      {
        hour,
      }
    );

    const minuteSelect =
      new StringSelectMenuBuilder()
        .setCustomId(
          'recruit_setup_minute'
        )
        .setPlaceholder(
          '분을 선택해주세요'
        )
        .addOptions(
          buildMinuteOptions()
        );

    const row =
      new ActionRowBuilder()
        .addComponents(
          minuteSelect
        );

    await interaction.update({
      content:
        `${getSetupTitle(session.type)} **설정**\n\n` +
        `✅ 현재 멤버: ${getMentionList(session.memberIds)}\n` +
        `✅ 시작 시간: **${hour}시**\n\n` +
        '③ 시작 예정 **분**을 선택해주세요.',

      components: [row],
    });

    return true;
  }


  if (
    interaction.isStringSelectMenu() &&
    interaction.customId ===
      'recruit_setup_minute'
  ) {
    const session =
      getSetupSession(
        interaction.guildId,
        interaction.user.id
      );

    if (!session) {
      await interaction.reply({
        content:
          '⏰ 구인 설정 시간이 만료됐어요. 다시 명령어를 실행해주세요.',
        ephemeral: true,
      });

      return true;
    }

    const minute =
      interaction.values[0];

    updateSetupSession(
      interaction.guildId,
      interaction.user.id,
      {
        minute,
      }
    );

    const {
      label,
    } = getVoiceRoomConfig(
      session.voiceKind
    );

    const roomSelect =
      new StringSelectMenuBuilder()
        .setCustomId(
          'recruit_setup_room'
        )
        .setPlaceholder(
          `${label}방을 선택해주세요`
        )
        .addOptions(
          buildRoomOptions(
            session.voiceKind
          )
        );

    const row =
      new ActionRowBuilder()
        .addComponents(
          roomSelect
        );

    await interaction.update({
      content:
        `${getSetupTitle(session.type)} **설정**\n\n` +
        `✅ 현재 멤버: ${getMentionList(session.memberIds)}\n` +
        `✅ 시작 예정: **${session.hour}:${minute}**\n\n` +
        `④ 사용할 **${label}방**을 선택해주세요.`,

      components: [row],
    });

    return true;
  }


  if (
    interaction.isStringSelectMenu() &&
    interaction.customId ===
      'recruit_setup_room'
  ) {
    const session =
      getSetupSession(
        interaction.guildId,
        interaction.user.id
      );

    if (!session) {
      await interaction.reply({
        content:
          '⏰ 구인 설정 시간이 만료됐어요. 다시 명령어를 실행해주세요.',
        ephemeral: true,
      });

      return true;
    }

    const roomNumber =
      Number(
        interaction.values[0]
      );

    const startTime =
      `${session.hour}:${session.minute}`;

    const {
      label,
    } = getVoiceRoomConfig(
      session.voiceKind
    );

    let recruitment;

    try {
      recruitment =
        createRecruitment({
          guildId:
            interaction.guildId,

          channelId:
            interaction.channelId,

          type:
            session.type,

          creatorId:
            interaction.user.id,

          voiceKind:
            session.voiceKind,

          voiceRoomNumber:
            roomNumber,

          gameName:
            session.gameName || null,

          newbieMemberIds:
            session.newbieMemberIds || [],

          capacity:
            session.capacity,

          startTime,

          memberIds:
            session.memberIds,
        });


      const snapshot =
        getRecruitmentSnapshot(
          recruitment.id
        );

      if (!snapshot) {
        throw new Error(
          '생성된 구인 정보를 DB에서 찾을 수 없습니다.'
        );
      }


      const recruitMessage =
        await interaction.channel.send(
          buildRecruitmentMessage(
            snapshot,
            {
              pingHere: true,
            }
          )
        );


      setRecruitmentMessageId(
        recruitment.id,
        recruitMessage.id
      );


      deleteSetupSession(
        interaction.guildId,
        interaction.user.id
      );


      await interaction.update({
        content:
          `✅ **${getCompleteTitle(session.type)} 생성 완료!**\n\n` +
          `🔊 ${label} ${roomNumber}번방\n` +
          `🕘 ${startTime}\n\n` +
          `[👉 구인글 바로가기](${recruitMessage.url})`,

        components: [],
      });

    } catch (error) {
      if (
        recruitment?.id
      ) {
        deleteRecruitment(
          recruitment.id
        );
      }

      throw error;
    }

    return true;
  }


  return false;
}


module.exports = {
  handleRecruitSetupInteraction,
};