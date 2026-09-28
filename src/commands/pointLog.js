const {
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');

const {
  ROLE_IDS
} = require('../config/constants');

const {
  getPointBalance,
  getRecentPointTransactions
} = require('../services/pointService');


function formatAmount(
  amount
) {
  return amount > 0
    ? `+${amount}P`
    : `${amount}P`;
}


function formatCreatedAt(
  createdAt
) {
  if (!createdAt) {
    return '시간 정보 없음';
  }

  /*
   * SQLite datetime('now')는 UTC 기준입니다.
   * Discord 타임스탬프로 변환하면
   * 각 사용자 현지시간으로 표시됩니다.
   */
  const date =
    new Date(
      createdAt.replace(
        ' ',
        'T'
      ) + 'Z'
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return createdAt;
  }


  const unix =
    Math.floor(
      date.getTime() / 1000
    );


  return `<t:${unix}:f>`;
}


module.exports = {
  data:
    new SlashCommandBuilder()
      .setName('포인트로그')
      .setDescription(
        '운영진이 멤버의 포인트 변동 내역을 확인합니다.'
      )

      .addUserOption(
        (option) =>
          option
            .setName('대상')
            .setDescription(
              '포인트 내역을 확인할 멤버'
            )
            .setRequired(true)
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

        ephemeral: true,
      });

      return;
    }


    const target =
      interaction.options.getUser(
        '대상',
        true
      );


    const balance =
      getPointBalance(
        interaction.guildId,
        target.id
      );


    const transactions =
      getRecentPointTransactions(
        interaction.guildId,
        target.id,
        15
      );


    const embed =
      new EmbedBuilder()
        .setTitle(
          '📒 포인트 로그'
        );


    if (
      transactions.length === 0
    ) {
      embed.setDescription(
        [
          `👤 <@${target.id}>`,
          `💰 현재 포인트: **${balance}P**`,
          '',
          '아직 포인트 변동 기록이 없습니다.',
        ].join('\n')
      );

    } else {
      const lines =
        transactions.map(
          (
            transaction,
            index
          ) => {
            const reason =
              transaction.description ||
              transaction.source;

            const manager =
              transaction.created_by
                ? `<@${transaction.created_by}>`
                : '🤖 자동 지급';


            return [
              `**${index + 1}. ${formatAmount(transaction.amount)} · ${reason}**`,
              `└ 잔액 **${transaction.balance_after}P** · 처리 ${manager}`,
              `└ ${formatCreatedAt(transaction.created_at)}`,
            ].join('\n');
          }
        );


      embed.setDescription(
        [
          `👤 <@${target.id}>`,
          `💰 현재 포인트: **${balance}P**`,
          '',
          ...lines,
        ].join('\n\n')
      );
    }


    await interaction.reply({
      embeds:
        [embed],

      ephemeral:
        true,

      allowedMentions: {
        parse: [],
      },
    });
  },
};