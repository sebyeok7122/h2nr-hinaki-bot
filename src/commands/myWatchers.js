const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder
} = require('discord.js');

const {
  getUserActiveWatchers,
  cancelUserWatcher
} = require('../services/watcherManageService');

const {
  getRecruitmentTitle,
  getVoiceRoomLabel
} = require('../ui/recruitMessageBuilder');

const {
  processRecruitmentQueue
} = require('../handlers/recruitButtonHandler');


function getJumpUrl(
  recruitment
) {
  if (
    !recruitment.guild_id ||
    !recruitment.channel_id ||
    !recruitment.message_id
  ) {
    return null;
  }


  return (
    'https://discord.com/channels/' +
    `${recruitment.guild_id}/` +
    `${recruitment.channel_id}/` +
    `${recruitment.message_id}`
  );
}


function buildMyWatchersView(
  guildId,
  userId
) {
  const entries =
    getUserActiveWatchers(
      guildId,
      userId
    );


  /*
   * 신청해둔 자리알림이 하나도 없을 때
   */
  if (
    entries.length === 0
  ) {
    const embed =
      new EmbedBuilder()
        .setTitle(
          '🔔 내 자리알림'
        )
        .setDescription(
          [
            '현재 신청해둔 자리알림이 없어요!',
            '',
            '모집이 가득 찬 구인에서',
            '🔔 **자리나면 알림**을 누르면',
            '이곳에서 한눈에 확인할 수 있습니다. 💛',
          ].join('\n')
        );


    return {
      embeds:
        [embed],

      components:
        [],

      allowedMentions: {
        parse: [],
      },
    };
  }


  const lines = [
    `현재 신청한 자리알림은 **${entries.length}개**입니다.`,
    '',
  ];


  /*
   * Discord 선택 메뉴는
   * 한 번에 최대 25개까지 표시 가능
   */
  const visibleEntries =
    entries.slice(
      0,
      25
    );


  for (
    let index = 0;
    index <
      visibleEntries.length;
    index += 1
  ) {
    const entry =
      visibleEntries[index];


    const recruitment =
      entry.recruitment;


    const title =
      getRecruitmentTitle(
        recruitment,
        false
      );


    const voiceRoom =
      getVoiceRoomLabel(
        recruitment
      );


    const jumpUrl =
      getJumpUrl(
        recruitment
      );


    const queueText =
      entry.hasPriority
        ? `⏳ **${entry.position}순위 · 우선 참여 중**`
        : `🔔 **대기 ${entry.position}순위**`;


    lines.push(
      `**${index + 1}. ${title}**`,
      `🔊 ${voiceRoom} · 👥 ${entry.memberCount} / ${entry.capacity}`,
      `🕘 시작 예정 ${recruitment.start_time}`,
      queueText
    );


    if (jumpUrl) {
      lines.push(
        `👉 [구인글 보기](${jumpUrl})`
      );
    }


    lines.push('');
  }


  if (
    entries.length > 25
  ) {
    lines.push(
      `외 ${entries.length - 25}개의 자리알림이 더 있습니다.`
    );
  }


  lines.push(
    '아래 메뉴에서 취소할 자리알림을 선택해주세요.'
  );


  const embed =
    new EmbedBuilder()
      .setTitle(
        '🔔 내 자리알림'
      )
      .setDescription(
        lines.join('\n')
      );


  const options =
    visibleEntries.map(
      (entry) => {
        const recruitment =
          entry.recruitment;


        const title =
          getRecruitmentTitle(
            recruitment,
            false
          );


        const voiceRoom =
          getVoiceRoomLabel(
            recruitment
          );


        const label =
          `${title} · ${voiceRoom}`
            .slice(
              0,
              100
            );


        const priorityText =
          entry.hasPriority
            ? '우선 참여 중'
            : `${entry.position}순위`;


        const description =
          `${priorityText} · 시작 ${recruitment.start_time}`
            .slice(
              0,
              100
            );


        return {
          label,
          description,

          value:
            String(
              entry.recruitmentId
            ),
        };
      }
    );


  const selectMenu =
    new StringSelectMenuBuilder()
      .setCustomId(
        'my_watchers_cancel'
      )
      .setPlaceholder(
        '🔕 취소할 자리알림을 선택해주세요'
      )
      .addOptions(
        options
      );


  const row =
    new ActionRowBuilder()
      .addComponents(
        selectMenu
      );


  return {
    embeds:
      [embed],

    components:
      [row],

    allowedMentions: {
      parse: [],
    },
  };
}


async function handleMyWatchersInteraction(
  client,
  interaction
) {
  if (
    !interaction.isStringSelectMenu()
  ) {
    return false;
  }


  if (
    interaction.customId !==
    'my_watchers_cancel'
  ) {
    return false;
  }


  const recruitmentId =
    Number(
      interaction.values[0]
    );


  if (
    !Number.isInteger(
      recruitmentId
    ) ||
    recruitmentId <= 0
  ) {
    await interaction.reply({
      content:
        '❎ 잘못된 자리알림 정보입니다.',

      ephemeral:
        true,
    });


    return true;
  }


  const result =
    cancelUserWatcher({
      guildId:
        interaction.guildId,

      userId:
        interaction.user.id,

      recruitmentId,
    });


  /*
   * 이미 만료됐거나
   * 다른 이유로 대기열에서 빠진 경우
   */
  if (
    result.code ===
    'NOT_FOUND'
  ) {
    const view =
      buildMyWatchersView(
        interaction.guildId,
        interaction.user.id
      );


    await interaction.update({
      content:
        'ℹ️ 이미 취소되었거나 종료된 자리알림이에요.',

      ...view,
    });


    return true;
  }


  /*
   * 정상 취소
   *
   * 만약 취소한 사람이 현재
   * 3분 우선권을 받고 있던 1순위라면
   * 다음 대기자에게 즉시 순번을 넘깁니다.
   */
  await processRecruitmentQueue(
    client,
    recruitmentId
  );


  const view =
    buildMyWatchersView(
      interaction.guildId,
      interaction.user.id
    );


  await interaction.update({
    content:
      '🔕 자리알림을 취소했습니다!',

    ...view,
  });


  return true;
}


module.exports = {
  data:
    new SlashCommandBuilder()
      .setName(
        '내자리알림'
      )
      .setDescription(
        '내가 신청한 자리알림을 확인하고 취소합니다.'
      ),


  async execute(
    interaction
  ) {
    const view =
      buildMyWatchersView(
        interaction.guildId,
        interaction.user.id
      );


    await interaction.reply({
      ...view,

      /*
       * 다른 사람에게는 보이지 않음
       */
      ephemeral:
        true,
    });
  },


  handleMyWatchersInteraction,
};