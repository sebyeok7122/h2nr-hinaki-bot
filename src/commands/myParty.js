const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const {
  db
} = require('../database/db');

const {
  getRecruitmentSnapshot
} = require('../services/recruitService');

const {
  getRecruitmentTitle,
  getVoiceRoomLabel
} = require('../ui/recruitMessageBuilder');


const selectMyActiveRecruitments =
  db.prepare(`
    SELECT id

    FROM recruitments

    WHERE
      guild_id = ?
      AND creator_id = ?
      AND status IN (
        'OPEN',
        'FULL'
      )

    ORDER BY
      id DESC

    LIMIT 25
  `);


const selectOwnedRecruitment =
  db.prepare(`
    SELECT *

    FROM recruitments

    WHERE
      id = ?
      AND guild_id = ?
      AND creator_id = ?
      AND status IN (
        'OPEN',
        'FULL'
      )
  `);


const selectActiveWatchers =
  db.prepare(`
    SELECT user_id

    FROM recruitment_watchers

    WHERE
      recruitment_id = ?
      AND is_active = 1

    ORDER BY
      julianday(created_at) ASC,
      rowid ASC
  `);


const markRecruitmentEnded =
  db.prepare(`
    UPDATE recruitments

    SET
      status = 'ENDED',
      updated_at = datetime('now')

    WHERE
      id = ?
      AND status IN (
        'OPEN',
        'FULL'
      )
  `);


const deactivateWatchers =
  db.prepare(`
    UPDATE recruitment_watchers

    SET
      is_active = 0

    WHERE
      recruitment_id = ?
      AND is_active = 1
  `);


const stopNewbieProgress =
  db.prepare(`
    UPDATE newbie_party_progress

    SET
      is_running = 0,
      running_since = NULL,
      updated_at = datetime('now')

    WHERE
      recruitment_id = ?
      AND completed = 0
  `);


const endPartyTransaction =
  db.transaction(
    (
      recruitmentId,
      guildId,
      creatorId
    ) => {
      const recruitment =
        selectOwnedRecruitment.get(
          recruitmentId,
          guildId,
          creatorId
        );


      if (!recruitment) {
        return {
          code:
            'NOT_FOUND',
        };
      }


      const watcherIds =
        selectActiveWatchers
          .all(
            recruitmentId
          )
          .map(
            (row) =>
              row.user_id
          );


      const result =
        markRecruitmentEnded.run(
          recruitmentId
        );


      if (
        result.changes <= 0
      ) {
        return {
          code:
            'NOT_FOUND',
        };
      }


      deactivateWatchers.run(
        recruitmentId
      );


      stopNewbieProgress.run(
        recruitmentId
      );


      return {
        code:
          'ENDED',

        recruitment,

        watcherIds,
      };
    }
  );


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


function getMyActiveParties(
  guildId,
  userId
) {
  const rows =
    selectMyActiveRecruitments.all(
      guildId,
      userId
    );


  const parties = [];


  for (
    const row of rows
  ) {
    const snapshot =
      getRecruitmentSnapshot(
        row.id
      );


    if (!snapshot) {
      continue;
    }


    parties.push(
      snapshot
    );
  }


  return parties;
}


function buildPartyListView(
  guildId,
  userId
) {
  const parties =
    getMyActiveParties(
      guildId,
      userId
    );


  if (
    parties.length === 0
  ) {
    const embed =
      new EmbedBuilder()
        .setTitle(
          '🎮 내 파티 찾기'
        )
        .setDescription(
          [
            '현재 내가 만든 진행 중인 파티가 없어요!',
            '',
            '새로운 파티를 모집하려면',
            '구인 명령어를 이용해주세요. 💛',
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
    `현재 내가 만든 파티는 **${parties.length}개**입니다.`,
    '',
  ];


  for (
    let index = 0;
    index < parties.length;
    index += 1
  ) {
    const snapshot =
      parties[index];


    const recruitment =
      snapshot.recruitment;


    const title =
      getRecruitmentTitle(
        recruitment,
        snapshot.isFull
      );


    lines.push(
      `**${index + 1}. ${title}**`,
      `🔊 ${getVoiceRoomLabel(recruitment)}`,
      `👥 ${snapshot.memberCount} / ${recruitment.capacity}`,
      `🕘 시작 예정 ${recruitment.start_time}`,
      ''
    );
  }


  lines.push(
    '아래에서 관리할 파티를 선택해주세요.'
  );


  const embed =
    new EmbedBuilder()
      .setTitle(
        '🎮 내 파티 찾기'
      )
      .setDescription(
        lines.join('\n')
      );


  const options =
    parties.map(
      (
        snapshot,
        index
      ) => {
        const recruitment =
          snapshot.recruitment;


        const title =
          getRecruitmentTitle(
            recruitment,
            false
          );


        return {
          label:
            `${index + 1}. ${title} · ${getVoiceRoomLabel(recruitment)}`
              .slice(
                0,
                100
              ),

          description:
            `현재 ${snapshot.memberCount}/${recruitment.capacity}명 · 시작 ${recruitment.start_time}`
              .slice(
                0,
                100
              ),

          value:
            String(
              recruitment.id
            ),
        };
      }
    );


  const selectMenu =
    new StringSelectMenuBuilder()
      .setCustomId(
        'my_party_select'
      )
      .setPlaceholder(
        '🎮 관리할 파티를 선택해주세요'
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


function buildPartyManageView(
  snapshot
) {
  const recruitment =
    snapshot.recruitment;


  const title =
    getRecruitmentTitle(
      recruitment,
      snapshot.isFull
    );


  const description =
    recruitment.description
      ?.trim() ||
    '작성된 설명 없음';


  const embed =
    new EmbedBuilder()
      .setTitle(
        '🛠️ 내 파티 관리'
      )
      .setDescription(
        [
          `🎮 **${title}**`,
          `🔊 **${getVoiceRoomLabel(recruitment)}**`,
          `👥 현재 인원 **${snapshot.memberCount} / ${recruitment.capacity}**`,
          `🕘 시작 예정 **${recruitment.start_time}**`,
          `📝 ${description}`,
          '',
          '파티글로 바로 이동하거나',
          '더 이상 모집하지 않을 경우 정상 종료할 수 있어요.',
        ].join('\n')
      );


  const buttons = [];


  const jumpUrl =
    getJumpUrl(
      recruitment
    );


  if (
    jumpUrl
  ) {
    buttons.push(
      new ButtonBuilder()
        .setLabel(
          '파티글로 이동'
        )
        .setEmoji(
          '🔗'
        )
        .setStyle(
          ButtonStyle.Link
        )
        .setURL(
          jumpUrl
        )
    );
  }


  buttons.push(
    new ButtonBuilder()
      .setCustomId(
        `my_party_end:${recruitment.id}`
      )
      .setLabel(
        '파티 종료'
      )
      .setEmoji(
        '🛑'
      )
      .setStyle(
        ButtonStyle.Danger
      )
  );


  const buttonRow =
    new ActionRowBuilder()
      .addComponents(
        buttons
      );


  const backRow =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            'my_party_back'
          )
          .setLabel(
            '내 파티 목록'
          )
          .setEmoji(
            '↩️'
          )
          .setStyle(
            ButtonStyle.Secondary
          )
      );


  return {
    embeds:
      [embed],

    components:
      [
        buttonRow,
        backRow,
      ],

    allowedMentions: {
      parse: [],
    },
  };
}


function buildEndedRecruitmentMessage(
  recruitment
) {
  const description =
    recruitment.description
      ?.trim() ||
    '작성된 설명 없음';


  const embed =
    new EmbedBuilder()
      .setTitle(
        '🛑 파티 종료'
      )
      .setDescription(
        [
          `🎮 **${getRecruitmentTitle(recruitment, false)}**`,
          `👤 파티장 <@${recruitment.creator_id}>`,
          `🔊 **${getVoiceRoomLabel(recruitment)}**`,
          `🕘 시작 예정 **${recruitment.start_time}**`,
          `📝 ${description}`,
          '',
          '✅ 파티장이 정상적으로 파티를 종료했습니다.',
          '',
          '※ 구인글을 직접 삭제한 것이 아니므로',
          '구인글 삭제 기록에는 포함되지 않습니다.',
        ].join('\n')
      );


  return {
    content:
      '',

    embeds:
      [embed],

    components:
      [],

    allowedMentions: {
      parse: [],
    },
  };
}


async function notifyEndedWatchers(
  client,
  watcherIds,
  recruitment
) {
  for (
    const userId of
      watcherIds
  ) {
    try {
      const user =
        await client.users.fetch(
          userId
        );


      await user.send(
        [
          '🛑 **희희낙락 자리알림 종료 안내**',
          '',
          '파티장이 해당 파티의 모집을 종료하여',
          '자리알림도 자동으로 종료되었습니다.',
          '',
          `🎮 ${getRecruitmentTitle(recruitment, false)}`,
          `🔊 ${getVoiceRoomLabel(recruitment)}`,
        ].join('\n')
      );

    } catch (error) {
      console.warn(
        `⚠️ 파티 종료 안내 DM 실패: ${userId}`,
        error.message
      );
    }
  }
}


async function updateOriginalMessageAsEnded(
  client,
  recruitment
) {
  if (
    !recruitment.channel_id ||
    !recruitment.message_id
  ) {
    return;
  }


  try {
    const channel =
      await client.channels.fetch(
        recruitment.channel_id
      );


    if (
      !channel ||
      !channel.isTextBased()
    ) {
      return;
    }


    const message =
      await channel.messages.fetch(
        recruitment.message_id
      );


    await message.edit(
      buildEndedRecruitmentMessage(
        recruitment
      )
    );


  } catch (error) {
    console.warn(
      `⚠️ 종료된 파티글 갱신 실패: ${recruitment.id}`,
      error.message
    );
  }
}


async function handleMyPartyInteraction(
  client,
  interaction
) {
  /*
   * 파티 선택
   */
  if (
    interaction.isStringSelectMenu() &&
    interaction.customId ===
      'my_party_select'
  ) {
    const recruitmentId =
      Number(
        interaction.values[0]
      );


    const snapshot =
      getRecruitmentSnapshot(
        recruitmentId
      );


    if (
      !snapshot ||
      snapshot.recruitment.guild_id !==
        interaction.guildId ||
      snapshot.recruitment.creator_id !==
        interaction.user.id ||
      ![
        'OPEN',
        'FULL',
      ].includes(
        snapshot.recruitment.status
      )
    ) {
      await interaction.update({
        content:
          '❎ 현재 관리할 수 없는 파티입니다.',

        ...buildPartyListView(
          interaction.guildId,
          interaction.user.id
        ),
      });


      return true;
    }


    await interaction.update({
      content:
        '',

      ...buildPartyManageView(
        snapshot
      ),
    });


    return true;
  }


  /*
   * 내 파티 목록으로 돌아가기
   */
  if (
    interaction.isButton() &&
    interaction.customId ===
      'my_party_back'
  ) {
    await interaction.update({
      content:
        '',

      ...buildPartyListView(
        interaction.guildId,
        interaction.user.id
      ),
    });


    return true;
  }


  /*
   * 정상 파티 종료
   */
  if (
    interaction.isButton() &&
    interaction.customId.startsWith(
      'my_party_end:'
    )
  ) {
    /*
     * ★ 핵심 수정
     *
     * 종료 작업이 여러 개라 시간이 걸릴 수 있으므로
     * Discord에게 먼저 버튼 응답을 받았다고 알려줍니다.
     *
     * 이렇게 해야
     * "애플리케이션이 응답하지 않았어요"
     * 오류가 발생하지 않습니다.
     */
    await interaction.deferUpdate();


    const recruitmentId =
      Number(
        interaction.customId.split(
          ':'
        )[1]
      );


    if (
      !Number.isInteger(
        recruitmentId
      ) ||
      recruitmentId <= 0
    ) {
      await interaction.editReply({
        content:
          '❎ 잘못된 파티 정보입니다.',

        embeds:
          [],

        components:
          [],
      });


      return true;
    }


    const result =
      endPartyTransaction(
        recruitmentId,
        interaction.guildId,
        interaction.user.id
      );


    if (
      result.code !==
      'ENDED'
    ) {
      await interaction.editReply({
        content:
          '❎ 이미 종료되었거나 관리할 수 없는 파티입니다.',

        ...buildPartyListView(
          interaction.guildId,
          interaction.user.id
        ),
      });


      return true;
    }


    /*
     * 원본 구인글을 정상 종료 상태로 변경
     */
    await updateOriginalMessageAsEnded(
      client,
      result.recruitment
    );


    /*
     * 자리알림 신청자들에게 종료 안내
     */
    await notifyEndedWatchers(
      client,
      result.watcherIds,
      result.recruitment
    );


    console.log(
      `🛑 [파티종료] 구인 ${recruitmentId} · 파티장 ${interaction.user.id}`
    );


    /*
     * deferUpdate()를 했으므로
     * interaction.update()가 아니라
     * editReply()로 화면을 갱신합니다.
     */
    await interaction.editReply({
      content:
        '✅ 파티를 정상적으로 종료했습니다!\n구인글은 삭제하지 않고 **파티 종료 상태**로 남겨두었어요. 💛',

      ...buildPartyListView(
        interaction.guildId,
        interaction.user.id
      ),
    });


    return true;
  }


  return false;
}


module.exports = {
  data:
    new SlashCommandBuilder()
      .setName(
        '내파티찾기'
      )
      .setDescription(
        '내가 만든 파티를 찾고 이동하거나 정상 종료합니다.'
      ),


  async execute(
    interaction
  ) {
    const view =
      buildPartyListView(
        interaction.guildId,
        interaction.user.id
      );


    await interaction.reply({
      ...view,

      ephemeral:
        true,
    });
  },


  handleMyPartyInteraction,
};