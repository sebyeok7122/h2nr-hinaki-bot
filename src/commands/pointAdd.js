const {
  SlashCommandBuilder
} = require('discord.js');

const {
  ROLE_IDS
} = require('../config/constants');

const {
  addPoints
} = require('../services/pointService');


const POINT_REASONS = {
  EXCELLENT_MEMBER: {
    label: '🏅 우수회원',
    amount: 3,
  },

  EXCELLENT_MEMBER_STREAK: {
    label: '🏆 2연속 우수회원',
    amount: 6,
  },

  KILL_EVENT_JOIN: {
    label: '🔫 킬내기 참여',
    amount: 1,
  },

  KILL_EVENT_WIN: {
    label: '👑 킬내기 우승',
    amount: 2,
  },

  EVENT_JOIN: {
    label: '🎉 이벤트 참여',
    amount: 3,
  },

  EVENT_WIN: {
    label: '🏆 이벤트 우승',
    amount: 5,
  },

  CHICKEN_PROOF: {
    label: '🍗 치킨 인증',
    amount: 1,
  },

  NEWBIE_CHICKEN: {
    label: '🌱 신입과 치킨 인증',
    amount: 2,
  },

  MAD_MOVIE_REPORT: {
    label: '🎬 매드무비 제보',
    amount: 1,
  },
};


module.exports = {
  data:
    new SlashCommandBuilder()
      .setName('포인트추가')
      .setDescription(
        '운영진이 멤버에게 포인트를 지급합니다.'
      )

      .addUserOption(
        (option) =>
          option
            .setName('대상')
            .setDescription(
              '포인트를 지급할 멤버'
            )
            .setRequired(true)
      )

      .addStringOption(
        (option) =>
          option
            .setName('사유')
            .setDescription(
              '포인트 지급 사유'
            )
            .setRequired(true)
            .addChoices(
              {
                name:
                  '🏅 우수회원 +3P',
                value:
                  'EXCELLENT_MEMBER',
              },
              {
                name:
                  '🏆 2연속 우수회원 +6P',
                value:
                  'EXCELLENT_MEMBER_STREAK',
              },
              {
                name:
                  '🔫 킬내기 참여 +1P',
                value:
                  'KILL_EVENT_JOIN',
              },
              {
                name:
                  '👑 킬내기 우승 +2P',
                value:
                  'KILL_EVENT_WIN',
              },
              {
                name:
                  '🎉 이벤트 참여 +3P',
                value:
                  'EVENT_JOIN',
              },
              {
                name:
                  '🏆 이벤트 우승 +5P',
                value:
                  'EVENT_WIN',
              },
              {
                name:
                  '🍗 치킨 인증 +1P',
                value:
                  'CHICKEN_PROOF',
              },
              {
                name:
                  '🌱 신입과 치킨 인증 +2P',
                value:
                  'NEWBIE_CHICKEN',
              },
              {
                name:
                  '🎬 매드무비 제보 +1P',
                value:
                  'MAD_MOVIE_REPORT',
              },
              {
                name:
                  '✏️ 기타 지급',
                value:
                  'OTHER',
              }
            )
      )

      .addIntegerOption(
        (option) =>
          option
            .setName('금액')
            .setDescription(
              '기타 지급일 때만 입력해주세요.'
            )
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(100000)
      )

      .addStringOption(
        (option) =>
          option
            .setName('기타사유')
            .setDescription(
              '기타 지급일 때 지급 사유를 적어주세요.'
            )
            .setRequired(false)
            .setMaxLength(100)
      ),


  async execute(
    interaction
  ) {
    /*
     * 운영진 역할 검사
     */
    if (
      !interaction.member.roles.cache.has(
        ROLE_IDS.STAFF
      )
    ) {
      await interaction.reply({
        content:
          '❎ 운영진만 사용할 수 있는 명령어입니다.',

        ephemeral: true,
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
          '❎ 봇 계정에는 포인트를 지급할 수 없어요.',

        ephemeral: true,
      });

      return;
    }


    const reasonCode =
      interaction.options.getString(
        '사유',
        true
      );


    let amount;
    let reasonLabel;


    /*
     * 기타 지급
     */
    if (
      reasonCode === 'OTHER'
    ) {
      amount =
        interaction.options.getInteger(
          '금액'
        );

      const customReason =
        interaction.options
          .getString(
            '기타사유'
          )
          ?.trim();


      if (
        !amount ||
        !customReason
      ) {
        await interaction.reply({
          content:
            '✏️ **기타 지급**을 선택했을 때는 `금액`과 `기타사유`를 모두 입력해주세요.',

          ephemeral: true,
        });

        return;
      }


      reasonLabel =
        customReason;

    } else {
      const reason =
        POINT_REASONS[
          reasonCode
        ];


      if (!reason) {
        await interaction.reply({
          content:
            '❎ 알 수 없는 포인트 지급 사유입니다.',

          ephemeral: true,
        });

        return;
      }


      amount =
        reason.amount;

      reasonLabel =
        reason.label;
    }


    const result =
      addPoints({
        guildId:
          interaction.guildId,

        userId:
          target.id,

        amount,

        source:
          reasonCode === 'OTHER'
            ? 'STAFF_OTHER'
            : reasonCode,

        description:
          reasonLabel,

        createdBy:
          interaction.user.id,
      });


    if (
      result.code !== 'OK'
    ) {
      await interaction.reply({
        content:
          '❎ 포인트 지급 처리 중 문제가 발생했습니다.',

        ephemeral: true,
      });

      return;
    }


    await interaction.reply({
      content:
        `✅ <@${target.id}>님에게 **+${amount}P** 지급 완료!\n` +
        `📝 사유: **${reasonLabel}**\n` +
        `💰 현재 포인트: **${result.balanceAfter}P**`,

      allowedMentions: {
        parse: [],
      },

      ephemeral: true,
    });
  },
};