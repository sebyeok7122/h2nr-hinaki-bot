const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

const {
  getSetupSession,
  updateSetupSession,
  deleteSetupSession
} = require('../services/recruitSetupService');

const {
  createRecruitment,
  setRecruitmentMessageId,
  deleteRecruitment
} = require('../services/recruitService');


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


function buildSquadRoomOptions() {
  const options = [];

  for (
    let room = 1;
    room <= 13;
    room += 1
  ) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(
          `스쿼드 ${room}번방`
        )
        .setValue(
          String(room)
        )
    );
  }

  return options;
}


function getMentionList(memberIds) {
  return memberIds
    .map(
      (id) => `<@${id}>`
    )
    .join(' ');
}


function buildRecruitmentMessage({
  recruitmentId,
  memberIds,
  capacity,
  startTime,
  roomNumber
}) {
  const memberCount =
    memberIds.length;

  const isFull =
    memberCount >= capacity;

  const remaining =
    Math.max(
      capacity - memberCount,
      0
    );

  const embed =
    new EmbedBuilder()
      .setTitle(
        isFull
          ? '✅ 모집 완료'
          : '🎮 일반게임 구인'
      )
      .setDescription(
        [
          `🔊 **스쿼드 ${roomNumber}번방**`,
          `👥 현재 인원 **${memberCount} / ${capacity}${isFull ? ' FULL' : ''}**`,
          `🕘 시작 예정 **${startTime}**`,
          `👤 ${getMentionList(memberIds)}`,
          '',
          isFull
            ? '✅ 모집이 완료되었습니다!'
            : `🔎 **${remaining}자리 모집 중**`,
        ].join('\n')
      );

  const buttons =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            `recruit_join:${recruitmentId}`
          )
          .setLabel('참여')
          .setEmoji('✅')
          .setStyle(
            ButtonStyle.Success
          )
          .setDisabled(isFull),

        new ButtonBuilder()
          .setCustomId(
            `recruit_cancel:${recruitmentId}`
          )
          .setLabel('취소')
          .setEmoji('❎')
          .setStyle(
            ButtonStyle.Danger
          ),

        new ButtonBuilder()
          .setCustomId(
            `recruit_notify:${recruitmentId}`
          )
          .setLabel(
            '자리나면 알림'
          )
          .setEmoji('🔔')
          .setStyle(
            ButtonStyle.Secondary
          )
      );

  return {
    content: '@here',
    embeds: [embed],
    components: [buttons],

    allowedMentions: {
      parse: [
        'everyone'
      ],
    },
  };
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
        '🎮 **일반게임 구인 설정**\n\n' +
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
        '🎮 **일반게임 구인 설정**\n\n' +
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

    const roomSelect =
      new StringSelectMenuBuilder()
        .setCustomId(
          'recruit_setup_room'
        )
        .setPlaceholder(
          '스쿼드방을 선택해주세요'
        )
        .addOptions(
          buildSquadRoomOptions()
        );

    const row =
      new ActionRowBuilder()
        .addComponents(
          roomSelect
        );

    await interaction.update({
      content:
        '🎮 **일반게임 구인 설정**\n\n' +
        `✅ 현재 멤버: ${getMentionList(session.memberIds)}\n` +
        `✅ 시작 예정: **${session.hour}:${minute}**\n\n` +
        '④ 사용할 **스쿼드방**을 선택해주세요.',
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

          capacity:
            session.capacity,

          startTime,

          memberIds:
            session.memberIds,
        });

      const recruitMessage =
        await interaction.channel.send(
          buildRecruitmentMessage({
            recruitmentId:
              recruitment.id,

            memberIds:
              session.memberIds,

            capacity:
              session.capacity,

            startTime,

            roomNumber,
          })
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
          '✅ **일반게임 구인 생성 완료!**\n\n' +
          `🔊 스쿼드 ${roomNumber}번방\n` +
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