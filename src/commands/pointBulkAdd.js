const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require('discord.js');

const {
  ROLE_IDS
} = require('../config/constants');

const {
  addPoints,
  promoteNewbieIfEligible
} = require('../services/pointService');


const MAX_BULK_USERS = 40;

const SESSION_TIMEOUT_MS =
  10 * 60 * 1000;


/*
 * 운영진별 일괄지급 임시 세션
 */
const bulkPointSessions =
  new Map();


const POINT_REASONS = {
  EXCELLENT_MEMBER: {
    label:
      '🏅 우수회원',
    amount:
      3,
  },

  EXCELLENT_MEMBER_STREAK: {
    label:
      '🏆 2연속 우수회원',
    amount:
      6,
  },

  KILL_EVENT_JOIN: {
    label:
      '🔫 킬내기 참여',
    amount:
      1,
  },

  KILL_EVENT_WIN: {
    label:
      '👑 킬내기 우승',
    amount:
      2,
  },

  EVENT_JOIN: {
    label:
      '🎉 이벤트 참여',
    amount:
      3,
  },

  EVENT_WIN: {
    label:
      '🏆 이벤트 우승',
    amount:
      5,
  },

  CHICKEN_PROOF: {
    label:
      '🍗 치킨 인증',
    amount:
      1,
  },

  NEWBIE_CHICKEN: {
    label:
      '🌱 신입과 치킨 인증',
    amount:
      2,
  },

  MAD_MOVIE_REPORT: {
    label:
      '🎬 매드무비 제보',
    amount:
      1,
  },
};


function getSessionKey(
  guildId,
  userId
) {
  return (
    `${guildId}:${userId}`
  );
}


function getSession(
  guildId,
  userId
) {
  const key =
    getSessionKey(
      guildId,
      userId
    );


  const session =
    bulkPointSessions.get(
      key
    );


  if (!session) {
    return null;
  }


  if (
    Date.now() -
      session.createdAt >
    SESSION_TIMEOUT_MS
  ) {
    if (
      session.collector &&
      !session.collector.ended
    ) {
      session.collector.stop(
        'expired'
      );
    }


    bulkPointSessions.delete(
      key
    );

    return null;
  }


  return session;
}


function deleteSession(
  guildId,
  userId
) {
  const key =
    getSessionKey(
      guildId,
      userId
    );


  const session =
    bulkPointSessions.get(
      key
    );


  if (
    session?.collector &&
    !session.collector.ended
  ) {
    session.collector.stop(
      'session_deleted'
    );
  }


  bulkPointSessions.delete(
    key
  );
}


function buildConfirmButtons() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          'bulk_point_confirm'
        )
        .setLabel(
          '일괄 지급'
        )
        .setEmoji(
          '✅'
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          'bulk_point_cancel'
        )
        .setLabel(
          '취소'
        )
        .setEmoji(
          '❎'
        )
        .setStyle(
          ButtonStyle.Secondary
        )
    );
}


function buildWaitingButtons() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          'bulk_point_cancel'
        )
        .setLabel(
          '취소'
        )
        .setEmoji(
          '❎'
        )
        .setStyle(
          ButtonStyle.Secondary
        )
    );
}


function buildSessionContent(
  session
) {
  const mentions =
    session.userIds.map(
      (userId) =>
        `<@${userId}>`
    );


  return [
    '💰 **포인트 일괄 지급 준비**',
    '',
    `📝 지급 사유: **${session.reasonLabel}**`,
    `💎 1인당 지급: **+${session.amount}P**`,
    `👥 지급 대상: **${session.userIds.length}/${MAX_BULK_USERS}명**`,
    '',
    '👤 **지급 대상**',
    mentions.join(' '),
    '',
    '대상을 확인한 뒤 **✅ 일괄 지급**을 눌러주세요.',
  ].join('\n');
}


async function safelyDeleteMessage(
  message
) {
  try {
    if (
      message.deletable
    ) {
      await message.delete();
    }
  } catch (error) {
    console.warn(
      '⚠️ [포인트 일괄지급] 대상 멘션 메시지 삭제 실패:',
      error.message
    );
  }
}


function createMentionCollector(
  interaction,
  session
) {
  const collector =
    interaction.channel.createMessageCollector({
      filter:
        (message) => {
          if (
            message.author.bot ||
            message.author.id !==
              interaction.user.id ||
            message.guildId !==
              interaction.guildId
          ) {
            return false;
          }


          /*
           * 희낙이를 함께 멘션한 메시지만 인식
           *
           * 예:
           * @희낙이 @바모 @핑키 @혜진 ...
           */
          return message.mentions.users.has(
            interaction.client.user.id
          );
        },

      time:
        SESSION_TIMEOUT_MS,
    });


  session.collector =
    collector;


  collector.on(
    'collect',
    async (message) => {
      const currentSession =
        getSession(
          interaction.guildId,
          interaction.user.id
        );


      if (
        currentSession !==
        session
      ) {
        collector.stop(
          'replaced'
        );

        return;
      }


      const mentionedUsers = [
        ...message.mentions.users.values(),
      ];


      const userIds = [
        ...new Set(
          mentionedUsers
            .filter(
              (user) =>
                user.id !==
                  interaction.client.user.id &&
                !user.bot
            )
            .map(
              (user) =>
                user.id
            )
        ),
      ];


      if (
        userIds.length ===
        0
      ) {
        await safelyDeleteMessage(
          message
        );


        await interaction.editReply({
          content:
            '❎ 지급 대상 멤버를 찾지 못했어요.\n\n' +
            `같은 채널에 **@${interaction.client.user.username} + 지급할 멤버들**을 한 메시지로 다시 멘션해주세요.`,

          components: [
            buildWaitingButtons(),
          ],
        });

        return;
      }


      if (
        userIds.length >
        MAX_BULK_USERS
      ) {
        await safelyDeleteMessage(
          message
        );


        await interaction.editReply({
          content:
            `❎ 한 번에 최대 **${MAX_BULK_USERS}명**까지 지급할 수 있어요.\n` +
            `현재 선택된 멤버는 **${userIds.length}명**입니다.\n\n` +
            `같은 채널에 **@${interaction.client.user.username} + 최대 ${MAX_BULK_USERS}명**으로 다시 멘션해주세요.`,

          components: [
            buildWaitingButtons(),
          ],
        });

        return;
      }


      session.userIds =
        userIds;


      collector.stop(
        'selected'
      );


      await safelyDeleteMessage(
        message
      );


      await interaction.editReply({
        content:
          buildSessionContent(
            session
          ),

        components: [
          buildConfirmButtons(),
        ],

        allowedMentions: {
          parse: [],
        },
      });
    }
  );


  collector.on(
    'end',
    async (
      collected,
      reason
    ) => {
      if (
        [
          'selected',
          'session_deleted',
          'replaced',
        ].includes(
          reason
        )
      ) {
        return;
      }


      const key =
        getSessionKey(
          interaction.guildId,
          interaction.user.id
        );


      const currentSession =
        bulkPointSessions.get(
          key
        );


      if (
        currentSession ===
        session
      ) {
        bulkPointSessions.delete(
          key
        );
      }


      if (
        reason ===
        'time'
      ) {
        try {
          await interaction.editReply({
            content:
              '⏰ 포인트 일괄 지급 입력 시간이 만료됐어요.\n`/포인트일괄지급 시작`을 다시 실행해주세요.',

            components:
              [],
          });

        } catch (error) {
          console.warn(
            '⚠️ [포인트 일괄지급] 만료 안내 실패:',
            error.message
          );
        }
      }
    }
  );
}


const command =
  new SlashCommandBuilder()
    .setName(
      '포인트일괄지급'
    )
    .setDescription(
      '운영진이 최대 40명에게 포인트를 한 번에 지급합니다.'
    )

    .addSubcommand(
      (subcommand) =>
        subcommand
          .setName(
            '시작'
          )
          .setDescription(
            '멤버들을 한 메시지에 멘션하여 일괄 지급합니다.'
          )

          .addStringOption(
            (option) =>
              option
                .setName(
                  '사유'
                )
                .setDescription(
                  '포인트 지급 사유'
                )
                .setRequired(
                  true
                )
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
                .setName(
                  '금액'
                )
                .setDescription(
                  '기타 지급일 때만 입력해주세요.'
                )
                .setRequired(
                  false
                )
                .setMinValue(
                  1
                )
                .setMaxValue(
                  100000
                )
          )

          .addStringOption(
            (option) =>
              option
                .setName(
                  '기타사유'
                )
                .setDescription(
                  '기타 지급일 때 사유를 입력해주세요.'
                )
                .setRequired(
                  false
                )
                .setMaxLength(
                  100
                )
          )
    );


module.exports = {
  data:
    command,


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


    const reasonCode =
      interaction.options.getString(
        '사유',
        true
      );


    let amount;
    let reasonLabel;
    let source;


    if (
      reasonCode ===
      'OTHER'
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

          flags:
            MessageFlags.Ephemeral,
        });

        return;
      }


      reasonLabel =
        customReason;

      source =
        'STAFF_OTHER';

    } else {
      const reason =
        POINT_REASONS[
          reasonCode
        ];


      if (!reason) {
        await interaction.reply({
          content:
            '❎ 알 수 없는 포인트 지급 사유입니다.',

          flags:
            MessageFlags.Ephemeral,
        });

        return;
      }


      amount =
        reason.amount;

      reasonLabel =
        reason.label;

      source =
        reasonCode;
    }


    /*
     * 같은 운영진의 이전 대기 세션이 있다면 종료
     */
    deleteSession(
      interaction.guildId,
      interaction.user.id
    );


    const session = {
      guildId:
        interaction.guildId,

      channelId:
        interaction.channelId,

      staffUserId:
        interaction.user.id,

      amount,

      reasonCode,

      reasonLabel,

      source,

      userIds:
        [],

      collector:
        null,

      createdAt:
        Date.now(),
    };


    bulkPointSessions.set(
      getSessionKey(
        interaction.guildId,
        interaction.user.id
      ),
      session
    );


    await interaction.reply({
      content:
        '💰 **포인트 일괄 지급 대상 입력**\n\n' +
        `📝 지급 사유: **${reasonLabel}**\n` +
        `💎 1인당 지급: **+${amount}P**\n\n` +
        '이제 **같은 채널에 한 메시지로** 지급할 멤버들을 멘션해주세요.\n\n' +
        `예시: **@${interaction.client.user.username} @바모 @핑키 @혜진 @꿀민 ...**\n\n` +
        `⚠️ 맨 앞에 **@${interaction.client.user.username}**도 꼭 같이 멘션해주세요.\n` +
        `👥 최대 **${MAX_BULK_USERS}명**까지 한 번에 받을 수 있어요.\n` +
        '같은 멤버를 여러 번 멘션해도 한 명으로 처리합니다.',

      components: [
        buildWaitingButtons(),
      ],

      flags:
        MessageFlags.Ephemeral,
    });


    createMentionCollector(
      interaction,
      session
    );
  },


  async handleBulkPointInteraction(
    interaction
  ) {
    const isConfirm =
      interaction.isButton() &&
      interaction.customId ===
        'bulk_point_confirm';


    const isCancel =
      interaction.isButton() &&
      interaction.customId ===
        'bulk_point_cancel';


    if (
      !isConfirm &&
      !isCancel
    ) {
      return false;
    }


    const session =
      getSession(
        interaction.guildId,
        interaction.user.id
      );


    if (!session) {
      await interaction.reply({
        content:
          '⏰ 일괄 지급 설정 시간이 만료됐어요. `/포인트일괄지급 시작`을 다시 실행해주세요.',

        flags:
          MessageFlags.Ephemeral,
      });

      return true;
    }


    /*
     * 취소
     */
    if (
      isCancel
    ) {
      deleteSession(
        interaction.guildId,
        interaction.user.id
      );


      await interaction.update({
        content:
          '❎ 포인트 일괄 지급을 취소했습니다.',

        components:
          [],
      });


      return true;
    }


    /*
     * 최종 지급
     */
    if (
      isConfirm
    ) {
      if (
        session.userIds.length ===
        0
      ) {
        await interaction.reply({
          content:
            '❎ 아직 지급 대상이 입력되지 않았어요.',

          flags:
            MessageFlags.Ephemeral,
        });

        return true;
      }


      /*
       * 중복 클릭 방지를 위해
       * 지급 전에 세션부터 제거합니다.
       */
      deleteSession(
        interaction.guildId,
        interaction.user.id
      );


      await interaction.deferUpdate();


      const successIds = [];
      const failedIds = [];
      const promotedIds = [];


      for (
        const userId of
          session.userIds
      ) {
        try {
          const result =
            addPoints({
              guildId:
                interaction.guildId,

              userId,

              amount:
                session.amount,

              source:
                session.source,

              description:
                session.reasonLabel,

              createdBy:
                interaction.user.id,
            });


          if (
            result.code !==
            'OK'
          ) {
            failedIds.push(
              userId
            );

            continue;
          }


          successIds.push(
            userId
          );


          /*
           * 신입 10P 자동등업 확인
           */
          const promotionResult =
            await promoteNewbieIfEligible(
              interaction.guild,
              userId
            );


          if (
            promotionResult.code ===
            'PROMOTED'
          ) {
            promotedIds.push(
              userId
            );

          } else if (
            promotionResult.code ===
            'ROLE_UPDATE_FAILED'
          ) {
            console.error(
              `❌ 일괄지급 자동등업 역할 변경 실패: ${userId}`,
              promotionResult.error
            );
          }

        } catch (
          error
        ) {
          console.error(
            `❌ 일괄 포인트 지급 실패: ${userId}`,
            error
          );


          failedIds.push(
            userId
          );
        }
      }


      const totalPoints =
        successIds.length *
        session.amount;


      const resultLines = [
        '✅ **포인트 일괄 지급 완료**',
        '',
        `📝 사유: **${session.reasonLabel}**`,
        `💎 1인당: **+${session.amount}P**`,
        `👥 성공: **${successIds.length}명**`,
        `💰 총 지급: **${totalPoints}P**`,
      ];


      if (
        failedIds.length > 0
      ) {
        resultLines.push(
          `❎ 실패: **${failedIds.length}명**`
        );
      }


      if (
        promotedIds.length > 0
      ) {
        resultLines.push(
          '',
          `🌱➡️💛 자동등업: **${promotedIds.length}명**`
        );
      }


      await interaction.editReply({
        content:
          resultLines.join('\n'),

        components:
          [],
      });


      /*
       * 자동등업된 사람이 있다면
       * 채널에 한 번만 안내
       */
      if (
        promotedIds.length > 0
      ) {
        const mentions =
          promotedIds.map(
            (userId) =>
              `<@${userId}>`
          );


        await interaction.channel.send({
          content:
            `🎉 ${mentions.join(' ')}님이 **10P를 달성하여 신입에서 멤버로 승급**했어요!\n` +
            '희희낙락 정식 멤버가 되신 걸 축하드립니다 💛',

          allowedMentions: {
            users:
              promotedIds,
          },
        });
      }


      console.log(
        `💰 [포인트 일괄지급] ${interaction.user.username} · ` +
        `${session.reasonLabel} +${session.amount}P · ` +
        `성공 ${successIds.length}명 · 실패 ${failedIds.length}명`
      );


      return true;
    }


    return false;
  },
};