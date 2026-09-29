const {
  SlashCommandBuilder,
  MessageFlags
} = require('discord.js');

const {
  ROLE_IDS
} = require('../config/constants');

const {
  deductPoints
} = require('../services/pointService');


module.exports = {
  data:
    new SlashCommandBuilder()
      .setName('포인트차감')
      .setDescription(
        '운영진이 멤버의 포인트를 차감합니다.'
      )

      .addUserOption(
        (option) =>
          option
            .setName('대상')
            .setDescription(
              '포인트를 차감할 멤버'
            )
            .setRequired(true)
      )

      .addIntegerOption(
        (option) =>
          option
            .setName('금액')
            .setDescription(
              '차감할 포인트'
            )
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100000)
      )

      .addStringOption(
        (option) =>
          option
            .setName('사유')
            .setDescription(
              '차감 사유를 입력해주세요.'
            )
            .setRequired(true)
            .setMaxLength(100)
      ),


  async execute(
    interaction
  ) {
    /*
     * 운영진 전용
     */
    if (
      !interaction.member.roles.cache.has(
        ROLE_IDS.STAFF
      )
    ) {
      await interaction.reply({
        content:
          '❎ 운영진만 사용할 수 있는 명령어입니다.',

        flags:
          MessageFlags.Ephemeral,
      });

      return;
    }


    const target =
      interaction.options.getUser(
        '대상',
        true
      );


    if (
      target.bot
    ) {
      await interaction.reply({
        content:
          '❎ 봇 계정의 포인트는 차감할 수 없어요.',

        flags:
          MessageFlags.Ephemeral,
      });

      return;
    }


    const amount =
      interaction.options.getInteger(
        '금액',
        true
      );


    const reason =
      interaction.options
        .getString(
          '사유',
          true
        )
        .trim();


    if (
      !reason
    ) {
      await interaction.reply({
        content:
          '❎ 포인트 차감 사유를 입력해주세요.',

        flags:
          MessageFlags.Ephemeral,
      });

      return;
    }


    const result =
      deductPoints({
        guildId:
          interaction.guildId,

        userId:
          target.id,

        amount,

        source:
          'STAFF_DEDUCT',

        description:
          reason,

        createdBy:
          interaction.user.id,
      });


    /*
     * 현재 보유 포인트보다
     * 많이 차감하려 한 경우
     */
    if (
      result.code ===
      'INSUFFICIENT_POINTS'
    ) {
      await interaction.reply({
        content:
          `❎ <@${target.id}>님의 현재 포인트는 **${result.balanceBefore}P**라서 ` +
          `**${amount}P**를 차감할 수 없어요.`,

        allowedMentions: {
          parse: [],
        },

        flags:
          MessageFlags.Ephemeral,
      });

      return;
    }


    if (
      result.code !==
      'OK'
    ) {
      await interaction.reply({
        content:
          '❎ 포인트 차감 처리 중 문제가 발생했습니다.',

        flags:
          MessageFlags.Ephemeral,
      });

      return;
    }


    await interaction.reply({
      content:
        `✅ <@${target.id}>님 포인트 **-${amount}P** 차감 완료!\n` +
        `📝 사유: **${reason}**\n` +
        `💰 이전 포인트: **${result.balanceBefore}P**\n` +
        `💰 현재 포인트: **${result.balanceAfter}P**`,

      allowedMentions: {
        parse: [],
      },

      flags:
        MessageFlags.Ephemeral,
    });


    console.log(
      `➖ [포인트 차감] ${target.username} (${target.id}) · -${amount}P · ${result.balanceBefore}P → ${result.balanceAfter}P · 사유: ${reason} · 처리자: ${interaction.user.username}`
    );
  },
};