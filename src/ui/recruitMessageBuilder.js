const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');


const TYPE_META = {
  GENERAL: {
    title:
      '🎮 일반게임 구인',

    fullTitle:
      '✅ 모집 완료',
  },

  RANKED: {
    title:
      '🏆 경쟁전 구인',

    fullTitle:
      '✅ 경쟁전 모집 완료',
  },

  GENERAL_HARD: {
    title:
      '🔥 일반 빡겜 구인',

    fullTitle:
      '✅ 일반 빡겜 모집 완료',
  },

  RANKED_HARD: {
    title:
      '🔥🏆 경쟁 빡겜 구인',

    fullTitle:
      '✅ 경쟁 빡겜 모집 완료',
  },

  NEWBIE: {
    title:
      '🌱 신입 파티 구해요!',

    fullTitle:
      '🌱 신입 파티 모집 완료!',
  },

  DUO: {
    title:
      '💕 듀오 구인',

    fullTitle:
      '✅ 듀오 모집 완료!',
  },

  OTHER_GAME: {
    title:
      '🎮 종겜 구인',

    fullTitle:
      '✅ 종겜 모집 완료!',
  },

  MERCENARY: {
    title:
      '🪖 용병 구인',

    fullTitle:
      '✅ 용병 모집 완료!',
  },
};


const VOICE_KIND_LABELS = {
  SQUAD:
    '스쿼드',

  DUO:
    '듀오',

  OTHER_GAME:
    '종겜',

  MERCENARY:
    '용병',
};


function getMentionList(
  memberIds
) {
  return memberIds
    .map(
      (id) => `<@${id}>`
    )
    .join(' ');
}


function getRecruitmentTitle(
  recruitment,
  isFull
) {
  if (
    recruitment.type ===
      'OTHER_GAME' &&
    recruitment.game_name
  ) {
    if (isFull) {
      return (
        '✅ 종겜 모집 완료! · ' +
        recruitment.game_name
      );
    }

    return (
      '🎮 종겜종류 : ' +
      recruitment.game_name
    );
  }


  const meta =
    TYPE_META[
      recruitment.type
    ] ||
    TYPE_META.GENERAL;


  return isFull
    ? meta.fullTitle
    : meta.title;
}


function getVoiceRoomLabel(
  recruitment
) {
  const label =
    VOICE_KIND_LABELS[
      recruitment.voice_kind
    ] || '스쿼드';


  return (
    `${label} ` +
    `${recruitment.voice_room_number}번방`
  );
}


function buildNewbieDescription(
  snapshot
) {
  const {
    recruitment,
    memberIds,
    newbieMemberIds,
    memberCount,
    remaining,
    isFull,
  } = snapshot;


  if (isFull) {
    return [
      `🔊 **${getVoiceRoomLabel(recruitment)}**`,
      `👥 **${memberCount} / ${recruitment.capacity} FULL**`,
      `🕘 시작 예정 **${recruitment.start_time}**`,
      `👤 ${getMentionList(memberIds)}`,
    ].join('\n');
  }


  const newbieMentions =
    newbieMemberIds.length > 0
      ? getMentionList(
          newbieMemberIds
        )
      : '현재 신입 없음';


  return [
    `🔊 **${getVoiceRoomLabel(recruitment)}**`,
    `👥 현재 인원 **${memberCount} / ${recruitment.capacity}**`,
    `🕘 시작 예정 **${recruitment.start_time}**`,
    `🌱 신입 ${newbieMentions}`,
    `➕ **${remaining}명 모집 중**`,
    '',
    '처음 같이 하는 분들도 부담 없이 참여해주세요!',
  ].join('\n');
}


function buildNormalDescription(
  snapshot
) {
  const {
    recruitment,
    memberIds,
    memberCount,
    remaining,
    isFull,
  } = snapshot;


  const description = [
    `🔊 **${getVoiceRoomLabel(recruitment)}**`,
    `👥 현재 인원 **${memberCount} / ${recruitment.capacity}${isFull ? ' FULL' : ''}**`,
    `🕘 시작 예정 **${recruitment.start_time}**`,
    `👤 ${getMentionList(memberIds)}`,
  ];


  if (
    recruitment.type ===
    'MERCENARY'
  ) {
    description.push(
      '',
      '※ 용병 역할 보유자가 최소 1명 포함되어야 합니다.'
    );
  }


  description.push(
    '',
    isFull
      ? '✅ 모집이 완료되었습니다!'
      : `🔎 **${remaining}자리 모집 중**`
  );


  return description.join('\n');
}


function buildRecruitmentMessage(
  snapshot,
  {
    pingHere = false,
  } = {}
) {
  const {
    recruitment,
    isFull,
  } = snapshot;


  const description =
    recruitment.type ===
    'NEWBIE'
      ? buildNewbieDescription(
          snapshot
        )
      : buildNormalDescription(
          snapshot
        );


  const embed =
    new EmbedBuilder()
      .setTitle(
        getRecruitmentTitle(
          recruitment,
          isFull
        )
      )
      .setDescription(
        description
      );


  const buttons =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            `recruit_join:${recruitment.id}`
          )
          .setLabel('참여')
          .setEmoji('✅')
          .setStyle(
            ButtonStyle.Success
          )
          .setDisabled(
            isFull
          ),

        new ButtonBuilder()
          .setCustomId(
            `recruit_cancel:${recruitment.id}`
          )
          .setLabel('취소')
          .setEmoji('❎')
          .setStyle(
            ButtonStyle.Danger
          ),

        new ButtonBuilder()
          .setCustomId(
            `recruit_notify:${recruitment.id}`
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
    content:
      '@here',

    embeds:
      [embed],

    components:
      [buttons],

    allowedMentions: {
      parse:
        pingHere
          ? ['everyone']
          : [],
    },
  };
}


module.exports = {
  buildRecruitmentMessage,
  getRecruitmentTitle,
  getVoiceRoomLabel,
  getMentionList,
};