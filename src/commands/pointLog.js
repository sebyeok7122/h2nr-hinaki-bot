const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const {
  getPointBalance,
  getRecentPointTransactions
} = require('../services/pointService');


const ITEMS_PER_PAGE =
  5;


/*
 * DB에 저장된 UTC 시간을
 * Discord의 짧은 날짜/시간 형식으로 표시합니다.
 *
 * 예:
 * 2026. 10. 4. 오후 10:55
 *
 * 사용자의 Discord 지역/시간대 설정에 맞게 표시됩니다.
 */
function formatCreatedAt(
  createdAt
) {
  if (
    !createdAt
  ) {
    return '시간 정보 없음';
  }


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


/*
 * 페이지 버튼을 만듭니다.
 */
function buildButtons(
  currentPage,
  totalPages
) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          'point_log_prev'
        )
        .setLabel(
          '이전'
        )
        .setEmoji(
          '◀️'
        )
        .setStyle(
          ButtonStyle.Secondary
        )
        .setDisabled(
          currentPage <= 0
        ),

      new ButtonBuilder()
        .setCustomId(
          'point_log_next'
        )
        .setLabel(
          '다음'
        )
        .setEmoji(
          '▶️'
        )
        .setStyle(
          ButtonStyle.Secondary
        )
        .setDisabled(
          currentPage >=
            totalPages - 1
        )
    );
}


/*
 * 페이지가 끝난 뒤에는
 * 버튼을 모두 비활성화합니다.
 */
function buildDisabledButtons() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          'point_log_prev'
        )
        .setLabel(
          '이전'
        )
        .setEmoji(
          '◀️'
        )
        .setStyle(
          ButtonStyle.Secondary
        )
        .setDisabled(
          true
        ),

      new ButtonBuilder()
        .setCustomId(
          'point_log_next'
        )
        .setLabel(
          '다음'
        )
        .setEmoji(
          '▶️'
        )
        .setStyle(
          ButtonStyle.Secondary
        )
        .setDisabled(
          true
        )
    );
}


/*
 * 포인트 로그 임베드를 만듭니다.
 */
function buildPointLogEmbed({
  target,
  balance,
  transactions,
  currentPage
}) {
  const totalPages =
    Math.max(
      1,
      Math.ceil(
        transactions.length /
        ITEMS_PER_PAGE
      )
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
        '아직 포인트 기록이 없습니다.',
      ].join('\n')
    );


    return embed;
  }


  const startIndex =
    currentPage *
    ITEMS_PER_PAGE;


  const pageTransactions =
    transactions.slice(
      startIndex,
      startIndex +
        ITEMS_PER_PAGE
    );


  const lines =
    pageTransactions.map(
      (
        transaction,
        index
      ) => {
        const reason =
          transaction.description ||
          transaction.source;


        const amountText =
          transaction.amount > 0
            ? `+${transaction.amount}P`
            : `${transaction.amount}P`;


        const number =
          startIndex +
          index +
          1;


        return (
          `**${number}. ${amountText} · ${reason}**` +
          ` · ${formatCreatedAt(
            transaction.created_at
          )}`
        );
      }
    );


  embed.setDescription(
    [
      `👤 <@${target.id}>`,
      `💰 현재 포인트: **${balance}P**`,
      '',
      ...lines,
    ].join('\n')
  );


  embed.setFooter({
    text:
      `${currentPage + 1} / ${totalPages} 페이지` +
      ` · 총 ${transactions.length}건`,
  });


  return embed;
}


module.exports = {
  data:
    new SlashCommandBuilder()
      .setName(
        '포인트로그'
      )
      .setDescription(
        '멤버의 포인트 획득 및 운영진 정정 내역을 확인합니다.'
      )

      .addUserOption(
        (option) =>
          option
            .setName(
              '대상'
            )
            .setDescription(
              '포인트 내역을 확인할 멤버'
            )
            .setRequired(
              true
            )
      ),


  async execute(
    interaction
  ) {
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


    /*
     * 공개 포인트 로그
     *
     * 보여주는 기록:
     * 1. 포인트 획득 기록
     * 2. 운영진이 직접 처리한 차감 기록
     *
     * 숨기는 기록:
     * - 희낙샵 구매 차감
     *
     * 페이지 방식이므로
     * 최근 기록 최대 100개까지 불러옵니다.
     */
    const transactions =
      getRecentPointTransactions(
        interaction.guildId,
        target.id,
        100
      )
        .filter(
          (transaction) =>
            transaction.amount > 0 ||
            transaction.source ===
              'STAFF_DEDUCT'
        );


    let currentPage =
      0;


    const totalPages =
      Math.max(
        1,
        Math.ceil(
          transactions.length /
          ITEMS_PER_PAGE
        )
      );


    const embed =
      buildPointLogEmbed({
        target,
        balance,
        transactions,
        currentPage,
      });


    /*
     * 기록이 5개 이하라면
     * 페이지 버튼 자체를 표시하지 않습니다.
     */
    const components =
      totalPages > 1
        ? [
            buildButtons(
              currentPage,
              totalPages
            ),
          ]
        : [];


    const reply =
      await interaction.reply({
        embeds:
          [embed],

        components,

        allowedMentions: {
          parse: [],
        },

        fetchReply:
          true,
      });


    /*
     * 한 페이지뿐이면
     * 버튼 처리도 필요 없습니다.
     */
    if (
      totalPages <= 1
    ) {
      return;
    }


    /*
     * 포인트로그를 실행한 사람이
     * 10분 동안 페이지를 넘길 수 있습니다.
     */
    const collector =
      reply.createMessageComponentCollector({
        time:
          10 * 60 * 1000,
      });


    collector.on(
      'collect',
      async (
        buttonInteraction
      ) => {
        /*
         * 다른 사람이 버튼을 누르면
         * 로그 페이지를 조작하지 못하게 합니다.
         */
        if (
          buttonInteraction.user.id !==
          interaction.user.id
        ) {
          await buttonInteraction.reply({
            content:
              '❎ 이 포인트로그의 페이지는 명령어를 실행한 사람만 넘길 수 있어요.',

            ephemeral:
              true,
          });


          return;
        }


        if (
          buttonInteraction.customId ===
          'point_log_prev'
        ) {
          currentPage =
            Math.max(
              0,
              currentPage - 1
            );
        }


        if (
          buttonInteraction.customId ===
          'point_log_next'
        ) {
          currentPage =
            Math.min(
              totalPages - 1,
              currentPage + 1
            );
        }


        const updatedEmbed =
          buildPointLogEmbed({
            target,
            balance,
            transactions,
            currentPage,
          });


        await buttonInteraction.update({
          embeds:
            [updatedEmbed],

          components:
            [
              buildButtons(
                currentPage,
                totalPages
              ),
            ],
        });
      }
    );


    collector.on(
      'end',
      async () => {
        try {
          await interaction.editReply({
            components:
              [
                buildDisabledButtons(),
              ],
          });

        } catch (error) {
          console.warn(
            '⚠️ 포인트로그 버튼 비활성화 실패:',
            error.message
          );
        }
      }
    );
  },
};