const {
  SlashCommandBuilder,
  ActionRowBuilder,
  UserSelectMenuBuilder,
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
 * 운영진별 일괄지급 임시 설정
 *
 * key:
 * guildId:userId
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
  bulkPointSessions.delete(
    getSessionKey(
      guildId,
      userId
    )
  );
}


function buildUserSelect(
  currentCount
) {
  const remaining =
    Math.max(
      MAX_BULK_USERS -
        currentCount,
      0
    );


  if (
    remaining <= 0
  ) {
    return null;
  }


  const maxValues =
    Math.min(
      remaining,
      25
    );


  return new ActionRowBuilder()
    .addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(
          'bulk_point_users'
        )
        .setPlaceholder(
          currentCount === 0
            ? '포인트를 지급할 멤버를 선택해주세요'
            : `멤버 추가 선택 · 현재 ${currentCount}/${MAX_BULK_USERS}명`
        )
        .setMinValues(
          1
        )
        .setMaxValues(
          maxValues
        )
    );
}


function buildButtons() {
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


function buildSessionContent(
  session
) {
  const selectedCount =
    session.userIds.length;


  const lines = [
    '💰 **포인트 일괄 지급**',
    '',
    `📝 지급 사유: **${session.reasonLabel}**`,
    `💎 1인당 지급: **+${session.amount}P**`,
    `👥 선택 인원: **${selectedCount}/${MAX_BULK_USERS}명**`,
  ];


  if (
    selectedCount > 0
  ) {
    lines.push(
      '',
      '👤 **현재 선택된 멤버**'
    );


    const mentions =
      session.userIds.map(
        (userId) =>
          `<@${userId}>`
      );


    lines.push(
      mentions.join(' ')
    );
  }


  lines.push(
    '',
    selectedCount === 0
      ? '아래에서 지급할 멤버를 선택해주세요.'
      : '멤버를 더 추가하거나 **일괄 지급**을 눌러주세요.'
  );


  return lines.join('\n');
}


function buildSessionComponents(
  session
) {
  const components = [];


  const userSelect =
    buildUserSelect(
      session.userIds.length
    );


  if (
    userSelect
  ) {
    components.push(
      userSelect
    );
  }


  if (
    session.userIds.length > 0
  ) {
    components.push(
      buildButtons()
    );
  }


  return components;
}


module.exports = {
  data:
    new SlashCommandBuilder()
      .setName(
        '포인트일괄지급'
      )
      .setDescription(
        '운영진이 최대 40명에게 포인트를 한 번에 지급합니다.'
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


    const reasonCode =
      interaction.options.getString(
        '사유',
        true
      );


    let amount;
    let reasonLabel;
    let source;


    /*
     * 기타 지급
     */
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


    const session = {
      guildId:
        interaction.guildId,

      staffUserId:
        interaction.user.id,

      amount,

      reasonCode,

      reasonLabel,

      source,

      userIds:
        [],

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
        buildSessionContent(
          session
        ),

      components:
        buildSessionComponents(
          session
        ),

      allowedMentions: {
        parse: [],
      },

      flags:
        MessageFlags.Ephemeral,
    });
  },


  async handleBulkPointInteraction(
    interaction
  ) {
    const isUserSelect =
      interaction.isUserSelectMenu() &&
      interaction.customId ===
        'bulk_point_users';


    const isConfirm =
      interaction.isButton() &&
      interaction.customId ===
        'bulk_point_confirm';


    const isCancel =
      interaction.isButton() &&
      interaction.customId ===
        'bulk_point_cancel';


    if (
      !isUserSelect &&
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
          '⏰ 일괄 지급 설정 시간이 만료됐어요. `/포인트일괄지급`을 다시 실행해주세요.',

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
     * 멤버 선택 / 추가
     */
    if (
      isUserSelect
    ) {
      const currentIds =
        new Set(
          session.userIds
        );


      let skippedBots = 0;


      for (
        const userId of
          interaction.values
      ) {
        const selectedUser =
          interaction.users.get(
            userId
          );


        if (
          selectedUser?.bot
        ) {
          skippedBots += 1;

          continue;
        }


        if (
          currentIds.size >=
          MAX_BULK_USERS
        ) {
          break;
        }


        currentIds.add(
          userId
        );
      }


      session.userIds =
        [...currentIds].slice(
          0,
          MAX_BULK_USERS
        );


      let content =
        buildSessionContent(
          session
        );


      if (
        skippedBots > 0
      ) {
        content +=
          `\n\n🤖 봇 계정 ${skippedBots}명은 선택에서 제외했습니다.`;
      }


      await interaction.update({
        content,

        components:
          buildSessionComponents(
            session
          ),

        allowedMentions: {
          parse: [],
        },
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
            '❎ 지급할 멤버가 선택되지 않았어요.',

          flags:
            MessageFlags.Ephemeral,
        });

        return true;
      }


      /*
       * 두 번 눌러 중복 지급되는 것을 막기 위해
       * 실제 지급 전에 세션부터 제거합니다.
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
           * 지급 후 신입 10P 자동등업 확인
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
       * 신입 → 멤버 승급자가 있다면
       * 채널에는 한 번만 묶어서 안내합니다.
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