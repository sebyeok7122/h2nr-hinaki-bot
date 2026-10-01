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

const USERS_PER_STEP = 20;

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


/*
 * 대상1 ~ 대상20
 * @유저 직접 선택 옵션
 */
function addUserOptions(
  subcommand
) {
  for (
    let number = 1;
    number <= USERS_PER_STEP;
    number += 1
  ) {
    subcommand.addUserOption(
      (option) =>
        option
          .setName(
            `대상${number}`
          )
          .setDescription(
            '포인트를 지급할 멤버'
          )
          .setRequired(
            number === 1
          )
    );
  }


  return subcommand;
}


function getSelectedUsers(
  interaction
) {
  const users = [];


  for (
    let number = 1;
    number <= USERS_PER_STEP;
    number += 1
  ) {
    const user =
      interaction.options.getUser(
        `대상${number}`
      );


    if (user) {
      users.push(
        user
      );
    }
  }


  return users;
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


  const mentions =
    session.userIds.map(
      (userId) =>
        `<@${userId}>`
    );


  const lines = [
    '💰 **포인트 일괄 지급 준비**',
    '',
    `📝 지급 사유: **${session.reasonLabel}**`,
    `💎 1인당 지급: **+${session.amount}P**`,
    `👥 선택 인원: **${selectedCount}/${MAX_BULK_USERS}명**`,
  ];


  if (
    mentions.length > 0
  ) {
    lines.push(
      '',
      '👤 **지급 대상**',
      mentions.join(' ')
    );
  }


  if (
    selectedCount <
    MAX_BULK_USERS
  ) {
    lines.push(
      '',
      '➕ 대상이 더 있다면 `/포인트일괄지급 추가`를 사용해주세요.'
    );
  }


  lines.push(
    '',
    '모두 확인한 뒤 **✅ 일괄 지급**을 눌러주세요.'
  );


  return lines.join('\n');
}


let startSubcommand =
  new SlashCommandBuilder()
    .setName(
      '포인트일괄지급'
    )
    .setDescription(
      '운영진이 최대 40명에게 포인트를 한 번에 지급합니다.'
    );


startSubcommand.addSubcommand(
  (subcommand) => {
    subcommand
      .setName(
        '시작'
      )
      .setDescription(
        '일괄 포인트 지급을 시작합니다.'
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
      );


    addUserOptions(
      subcommand
    );


    subcommand
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
      );


    return subcommand;
  }
);


startSubcommand.addSubcommand(
  (subcommand) => {
    subcommand
      .setName(
        '추가'
      )
      .setDescription(
        '진행 중인 일괄 지급에 멤버를 추가합니다.'
      );


    addUserOptions(
      subcommand
    );


    return subcommand;
  }
);


module.exports = {
  data:
    startSubcommand,


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


    const subcommand =
      interaction.options.getSubcommand(
        true
      );


    /*
     * ─────────────────────
     * 일괄지급 시작
     * ─────────────────────
     */
    if (
      subcommand ===
      '시작'
    ) {
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


      const selectedUsers =
        getSelectedUsers(
          interaction
        );


      const userIds = [
        ...new Set(
          selectedUsers
            .filter(
              (user) =>
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
        await interaction.reply({
          content:
            '❎ 지급할 멤버를 한 명 이상 선택해주세요.',

          flags:
            MessageFlags.Ephemeral,
        });

        return;
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

        userIds,

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

        components: [
          buildButtons(),
        ],

        allowedMentions: {
          parse: [],
        },

        flags:
          MessageFlags.Ephemeral,
      });


      return;
    }


    /*
     * ─────────────────────
     * 대상 추가
     * ─────────────────────
     */
    if (
      subcommand ===
      '추가'
    ) {
      const session =
        getSession(
          interaction.guildId,
          interaction.user.id
        );


      if (!session) {
        await interaction.reply({
          content:
            '⏰ 진행 중인 일괄 지급이 없어요.\n먼저 `/포인트일괄지급 시작`을 실행해주세요.',

          flags:
            MessageFlags.Ephemeral,
        });

        return;
      }


      if (
        session.userIds.length >=
        MAX_BULK_USERS
      ) {
        await interaction.reply({
          content:
            '👥 이미 최대 인원인 **40명**이 선택되어 있어요.',

          flags:
            MessageFlags.Ephemeral,
        });

        return;
      }


      const selectedUsers =
        getSelectedUsers(
          interaction
        );


      const currentIds =
        new Set(
          session.userIds
        );


      let duplicateCount = 0;
      let botCount = 0;
      let addedCount = 0;


      for (
        const user of
          selectedUsers
      ) {
        if (
          user.bot
        ) {
          botCount += 1;

          continue;
        }


        if (
          currentIds.has(
            user.id
          )
        ) {
          duplicateCount += 1;

          continue;
        }


        if (
          currentIds.size >=
          MAX_BULK_USERS
        ) {
          break;
        }


        currentIds.add(
          user.id
        );

        addedCount += 1;
      }


      session.userIds =
        [...currentIds];


      let content =
        buildSessionContent(
          session
        );


      content +=
        `\n\n➕ 이번에 추가된 멤버: **${addedCount}명**`;


      if (
        duplicateCount > 0
      ) {
        content +=
          `\n♻️ 중복 선택 제외: **${duplicateCount}명**`;
      }


      if (
        botCount > 0
      ) {
        content +=
          `\n🤖 봇 계정 제외: **${botCount}명**`;
      }


      await interaction.reply({
        content,

        components: [
          buildButtons(),
        ],

        allowedMentions: {
          parse: [],
        },

        flags:
          MessageFlags.Ephemeral,
      });


      return;
    }
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