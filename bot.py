from __future__ import annotations

import asyncio
import logging
import os
import re
from calendar import Calendar, SUNDAY
from datetime import date
from pathlib import Path

import aiohttp
import discord
from discord import app_commands
from discord.ext import tasks
from dotenv import load_dotenv

from excursions import (
    DmResult, Excursion, RetryLater, Store, korea_today, one_month_after, scan_overdue,
    validate_application,
)

NO_PINGS = discord.AllowedMentions.none()
log = logging.getLogger("excursion_bot")
GUILD_TEXT = (discord.TextChannel, discord.Thread)
PANEL = (
    "## 🌿 외출봇 설명서\n"
    "1. **외출 신청** 버튼을 눌러 주세요.\n"
    "2. 달력에서 복귀 예정일을 고르고 사유를 간단히 적어 주세요. 외출은 **최대 한 달**까지 가능해요.\n"
    "3. 돌아오시면 **복귀** 버튼을 꼭 눌러 주세요 ❤️\n"
    "4. 기간 안에 복귀하기 어렵거나 개인 사정으로 일정이 바뀌면 **운영진에게 꼭 DM** 부탁드려요."
)


def safe_text(value: str) -> str:
    return discord.utils.escape_markdown(discord.utils.escape_mentions(value))


def read_id(name: str, raw: str) -> int:
    if not re.fullmatch(r"[1-9][0-9]{16,19}", raw.strip()):
        raise ValueError(f"{name}에 디스코드 ID를 숫자로 입력해 주세요.")
    return int(raw.strip())


async def member_return(interaction: discord.Interaction, row_id: int | None = None) -> None:
    bot: ExcursionBot = interaction.client
    if (
        (interaction.guild_id is not None and interaction.guild_id != bot.guild_id)
        or (row_id is None and interaction.guild_id != bot.guild_id)
    ):
        await interaction.response.send_message("희희낙락 서버에서만 사용할 수 있어요.", ephemeral=True)
        return
    ok = bot.store.return_member(bot.guild_id, interaction.user.id, row_id)
    if ok:
        reply = "복귀 처리됐어요! 돌아오신 걸 환영합니다 🌿"
    elif row_id is not None:
        reply = "이미 복귀했거나 더 이상 유효하지 않은 신청이에요."
    else:
        reply = "현재 복귀 처리할 외출 신청이 없어요."
    await interaction.response.send_message(reply, ephemeral=True)


class ApplicationForm(discord.ui.Modal, title="외출 신청"):
    reason = discord.ui.TextInput(
        label="외출 사유", placeholder="예) 개인 일정", max_length=100,
    )

    def __init__(self, due: date):
        super().__init__(title=f"외출 신청 · {due.month}월 {due.day}일 복귀", timeout=300)
        self.due = due

    async def on_submit(self, interaction: discord.Interaction) -> None:
        bot: ExcursionBot = interaction.client
        if interaction.guild_id != bot.guild_id:
            await interaction.response.send_message("희희낙락 서버에서만 신청할 수 있어요.", ephemeral=True)
            return
        today = korea_today()
        try:
            due, reason = validate_application(today, self.due.isoformat(), self.reason.value)
        except ValueError as exc:
            await interaction.response.send_message(
                f"{exc}\n안내판에서 **외출 신청**을 다시 눌러 주세요.", ephemeral=True
            )
            return
        if not bot.store.apply(bot.guild_id, interaction.user.id, today, due, reason):
            await interaction.response.send_message(
                "이미 진행 중인 외출 신청이 있어요. 일정 변경이 필요하면 운영진에게 따로 DM 부탁드립니다.",
                ephemeral=True,
            )
            return
        await interaction.response.send_message(
            f"외출 신청 완료 🌿\n기간 **{today} ~ {due} (한국 시간)**\n"
            "돌아오시면 안내판의 **복귀** 버튼을 꼭 눌러 주세요!",
            ephemeral=True,
        )


DAY_LABELS = "월화수목금토일"


class ReturnDateSelect(discord.ui.Select):
    def __init__(self, dates: list[date], today: date, row: int, placeholder: str):
        options = [
            discord.SelectOption(
                label=f"{day.month}월 {day.day}일 ({DAY_LABELS[day.weekday()]})"
                      + (" · 오늘" if day == today else ""),
                value=day.isoformat(),
            )
            for day in dates
        ]
        super().__init__(options=options, row=row, placeholder=placeholder)

    async def callback(self, interaction: discord.Interaction) -> None:
        due = date.fromisoformat(self.values[0])
        today = korea_today()
        if not today <= due <= one_month_after(today):
            await interaction.response.send_message(
                "선택할 수 있는 기간이 바뀌었어요. 안내판의 **외출 신청**을 다시 눌러 주세요.",
                ephemeral=True,
            )
            return
        await interaction.response.send_modal(ApplicationForm(due))


class ReturnCalendar(discord.ui.View):
    def __init__(self, owner_id: int, today: date, month: date | None = None):
        super().__init__(timeout=300)
        self.owner_id = owner_id
        self.today = today
        self.last = one_month_after(today)
        self.first_month = today.replace(day=1)
        self.last_month = self.last.replace(day=1)
        self.month = (month or today).replace(day=1)
        self.previous.disabled = self.month <= self.first_month
        self.next.disabled = self.month >= self.last_month

        weeks = Calendar(firstweekday=SUNDAY).monthdayscalendar(self.month.year, self.month.month)
        self.weeks = [
            [self.month.replace(day=day) if day else None for day in week]
            for week in weeks
        ]
        dates = [day for week in self.weeks for day in week if day and self.today <= day <= self.last]
        if len(dates) <= 25:
            self.add_item(ReturnDateSelect(dates, today, row=1, placeholder="복귀 날짜 선택하기"))
        else:
            for row, days in enumerate((dates[:15], dates[15:]), start=1):
                placeholder = f"{days[0].day}~{days[-1].day}일 중 선택하기"
                self.add_item(ReturnDateSelect(days, today, row=row, placeholder=placeholder))

    def render(self) -> discord.Embed:
        def cell(day: date | None) -> str:
            if day is None:
                return "    "
            return f"[{day.day:02d}]" if self.today <= day <= self.last else f" {day.day:02d} "

        lines = [" ".join(f" {label} " for label in "일월화수목금토").rstrip()]
        lines.extend(" ".join(cell(day) for day in week).rstrip() for week in self.weeks)
        grid = "\n".join(lines)
        month_hint = (
            "다음 달 날짜는 **다음 달 →** 버튼으로 볼 수 있어요."
            if self.month == self.first_month else "이번 달은 **← 이전 달** 버튼으로 돌아갈 수 있어요."
        )
        return discord.Embed(
            title=f"📅 {self.month.year}년 {self.month.month}월 · 복귀 날짜 선택",
            description=(
                f"```\n{grid}\n```\n"
                "**[ ] 표시된 날짜**를 아래 목록에서 골라 주세요.\n"
                f"{month_hint}"
            ),
            color=0x82BA78,
        ).set_footer(text=f"한국 시간 · {self.today:%m/%d} ~ {self.last:%m/%d} 중 선택")

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id == self.owner_id and interaction.guild_id == interaction.client.guild_id:
            return True
        await interaction.response.send_message("안내판의 **외출 신청**을 눌러 주세요.", ephemeral=True)
        return False

    async def show_month(self, interaction: discord.Interaction, month: date) -> None:
        view = ReturnCalendar(self.owner_id, self.today, month)
        self.stop()
        await interaction.response.edit_message(embed=view.render(), view=view)

    @discord.ui.button(label="← 이전 달", style=discord.ButtonStyle.secondary, row=0)
    async def previous(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        await self.show_month(interaction, self.first_month)

    @discord.ui.button(label="다음 달 →", style=discord.ButtonStyle.secondary, row=0)
    async def next(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        await self.show_month(interaction, self.last_month)


class PanelView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="외출 신청", style=discord.ButtonStyle.primary, custom_id="h2nr:excursion:apply")
    async def apply(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        if interaction.guild_id != interaction.client.guild_id:
            await interaction.response.send_message("희희낙락 서버에서만 신청할 수 있어요.", ephemeral=True)
            return
        view = ReturnCalendar(interaction.user.id, korea_today())
        await interaction.response.send_message(embed=view.render(), view=view, ephemeral=True)

    @discord.ui.button(label="복귀", style=discord.ButtonStyle.success, custom_id="h2nr:excursion:return")
    async def finish(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        await member_return(interaction)


class DmReturn(discord.ui.DynamicItem[discord.ui.Button], template=r"h2nr:excursion:dm-return:(?P<row_id>[0-9]+)"):
    def __init__(self, row_id: int):
        self.row_id = row_id
        super().__init__(
            discord.ui.Button(
                label="복귀", style=discord.ButtonStyle.success, custom_id=f"h2nr:excursion:dm-return:{row_id}"
            )
        )

    @classmethod
    async def from_custom_id(
        cls, interaction: discord.Interaction, item: discord.ui.Button, match: re.Match[str]
    ) -> DmReturn:
        return cls(int(match["row_id"]))

    async def callback(self, interaction: discord.Interaction) -> None:
        await member_return(interaction, self.row_id)


class StaffList(discord.ui.View):
    size = 8

    def __init__(self, items: list[Excursion], owner_id: int):
        super().__init__(timeout=300)
        self.items = items
        self.owner_id = owner_id

    def render(self, index: int) -> discord.Embed:
        pages = (len(self.items) + self.size - 1) // self.size
        index = min(max(0, index), pages - 1)
        self.page = index
        self.previous.disabled = index == 0
        self.next.disabled = index + 1 == pages
        today = korea_today()
        embed = discord.Embed(
            title=f"외출 인원 · {len(self.items)}명", color=0x82BA78,
            description="복귀 버튼을 아직 누르지 않은 인원입니다.",
        )
        for row in self.items[index * self.size : (index + 1) * self.size]:
            status = "미복귀" if row.overdue(today) else "외출 중"
            embed.add_field(
                name=f"{status} · {row.start_date} ~ {row.due_date}",
                value=f"<@{row.user_id}>\n사유　{safe_text(row.reason)}",
                inline=False,
            )
        embed.set_footer(text=f"{index + 1} / {pages} · 한국 시간")
        return embed

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id == self.owner_id and interaction.client.is_staff(interaction):
            return True
        await interaction.response.send_message("운영진만 볼 수 있어요.", ephemeral=True)
        return False

    @discord.ui.button(label="이전", style=discord.ButtonStyle.secondary)
    async def previous(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        await interaction.response.edit_message(embed=self.render(self.page - 1), view=self)

    @discord.ui.button(label="다음", style=discord.ButtonStyle.secondary)
    async def next(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        await interaction.response.edit_message(embed=self.render(self.page + 1), view=self)


class ExcursionBot(discord.Client):
    def __init__(self, guild_id: int, warning_id: int, staff_role_ids: set[int], store: Store):
        super().__init__(intents=discord.Intents(guilds=True), allowed_mentions=NO_PINGS)
        self.guild_id = guild_id
        self.warning_id = warning_id
        self.staff_role_ids = staff_role_ids
        self.store = store
        self.tree = app_commands.CommandTree(self)

    def is_staff(self, interaction: discord.Interaction) -> bool:
        member = interaction.user
        return (
            interaction.guild_id == self.guild_id
            and isinstance(member, discord.Member)
            and (
                member.guild_permissions.manage_guild
                or any(role.id in self.staff_role_ids for role in member.roles)
            )
        )

    async def setup_hook(self) -> None:
        self.add_view(PanelView())
        self.add_dynamic_items(DmReturn)
        target = discord.Object(id=self.guild_id)
        self.tree.add_command(post_panel, guild=target)
        self.tree.add_command(list_excursions, guild=target)
        synced = await self.tree.sync(guild=target)
        log.info("서버 %s에 명령어 %s개 등록", self.guild_id, len(synced))
        self.overdue_worker.start()

    async def close(self) -> None:
        task = self.overdue_worker.get_task()
        if task is not None and not task.done():
            self.overdue_worker.cancel()
            await asyncio.gather(task, return_exceptions=True)
        await super().close()

    @tasks.loop(seconds=45)
    async def overdue_worker(self) -> None:
        try:
            if self.get_guild(self.guild_id) is not None and self.is_ready():
                await scan_overdue(self.store, self.guild_id, self)
        except Exception:
            log.exception("미복귀 확인 중 오류. 다음 주기에 다시 확인합니다.")

    @overdue_worker.before_loop
    async def before_overdue_worker(self) -> None:
        await self.wait_until_ready()
        if self.get_guild(self.guild_id) is None:
            log.error("설정한 서버를 찾을 수 없습니다. 서버 ID와 봇 초대를 확인해 주세요.")

    async def send_dm(self, excursion: Excursion) -> DmResult:
        try:
            uid = int(excursion.user_id)
            guild = self.get_guild(self.guild_id)
            user = self.get_user(uid) or await self.fetch_user(uid)
            member = guild.get_member(uid) if guild else None
            display = safe_text(member.display_name if member else user.display_name)
            view = discord.ui.View(timeout=None)
            view.add_item(DmReturn(excursion.id))
            await user.send(
                f"{display}님! 아직 복귀를 하지 않으셨네요!\n"
                "따로 사정이 생겨서 돌아오지 못하시는 경우엔 운영진에게 따로 DM 부탁드립니다!\n\n"
                "이미 돌아오셨다면 아래 **복귀** 버튼을 눌러 주세요.",
                view=view, allowed_mentions=NO_PINGS, nonce=f"h2dm{excursion.id}",
            )
        except (discord.Forbidden, discord.NotFound):
            return "blocked"
        except (discord.HTTPException, aiohttp.ClientError, OSError) as exc:
            raise RetryLater(_delivery_error(exc)) from exc
        return "sent"

    async def warning_channel(self) -> discord.TextChannel:
        channel = self.get_channel(self.warning_id) or await self.fetch_channel(self.warning_id)
        if not isinstance(channel, discord.TextChannel) or channel.guild.id != self.guild_id:
            raise RetryLater("DISCORD_WARNING_CHANNEL_ID를 같은 서버의 텍스트 채널 ID로 설정해 주세요.")
        return channel

    async def send_warning(self, excursion: Excursion) -> int:
        try:
            channel = await self.warning_channel()
            dm = {
                "sent": "전송 완료",
                "blocked": "전송 불가 (DM 설정 또는 계정 상태 확인 필요)",
                "pending": "아직 전송되지 않음 (재시도 예정)",
            }[excursion.dm_state]
            msg = await channel.send(
                f"⚠️ **외출 미복귀** · <@{excursion.user_id}>\n"
                f"복귀 예정일　{excursion.due_date} (한국 시간)\nDM　{dm}",
                allowed_mentions=NO_PINGS, nonce=f"h2warn{excursion.id}",
            )
        except (discord.HTTPException, aiohttp.ClientError, OSError) as exc:
            raise RetryLater(_delivery_error(exc)) from exc
        return msg.id


def _delivery_error(exc: Exception) -> str:
    if isinstance(exc, discord.HTTPException):
        return f"Discord HTTP {exc.status}, code {exc.code}"
    return type(exc).__name__


@app_commands.command(name="외출안내", description="이 채널에 외출 신청 및 복귀 안내판을 올립니다.")
async def post_panel(interaction: discord.Interaction) -> None:
    bot: ExcursionBot = interaction.client
    if not bot.is_staff(interaction):
        await interaction.response.send_message("운영진만 사용할 수 있는 명령어예요.", ephemeral=True)
        return
    if not isinstance(interaction.channel, GUILD_TEXT):
        await interaction.response.send_message("서버 텍스트 채널에서 실행해 주세요.", ephemeral=True)
        return
    await interaction.response.defer(ephemeral=True, thinking=True)
    try:
        warning = await bot.warning_channel()
        me = warning.guild.me or await warning.guild.fetch_member(bot.user.id)
        permissions = warning.permissions_for(me)
        if not (permissions.view_channel and permissions.send_messages):
            await interaction.edit_original_response(
                content="봇에 #외출경고 채널 보기와 메시지 보내기 권한을 준 뒤 다시 실행해 주세요."
            )
            return
        await interaction.channel.send(PANEL, view=PanelView(), allowed_mentions=NO_PINGS)
    except (discord.HTTPException, RetryLater, aiohttp.ClientError, OSError):
        await interaction.edit_original_response(
            content="안내판을 게시하지 못했어요. 경고 채널 ID와 두 채널의 봇 권한을 확인해 주세요."
        )
        return
    await interaction.edit_original_response(content="외출 안내판을 올렸어요!")


@app_commands.command(name="외출인원", description="외출 중이거나 미복귀한 인원과 사유를 운영진만 확인합니다.")
async def list_excursions(interaction: discord.Interaction) -> None:
    bot: ExcursionBot = interaction.client
    if not bot.is_staff(interaction):
        await interaction.response.send_message("운영진만 사용할 수 있는 명령어예요.", ephemeral=True)
        return
    rows = bot.store.open(bot.guild_id)
    if not rows:
        await interaction.response.send_message("현재 외출 중인 인원이 없어요.", ephemeral=True)
        return
    view = StaffList(rows, interaction.user.id)
    embed = view.render(0)
    if len(rows) <= view.size:
        await interaction.response.send_message(embed=embed, ephemeral=True, allowed_mentions=NO_PINGS)
    else:
        await interaction.response.send_message(embed=embed, view=view, ephemeral=True, allowed_mentions=NO_PINGS)


def main() -> None:
    load_dotenv()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    token = os.getenv("DISCORD_TOKEN", "").strip()
    if not token:
        raise SystemExit("DISCORD_TOKEN을 설정해 주세요.")
    try:
        guild_id = read_id("DISCORD_GUILD_ID", os.getenv("DISCORD_GUILD_ID", ""))
        warning_id = read_id("DISCORD_WARNING_CHANNEL_ID", os.getenv("DISCORD_WARNING_CHANNEL_ID", ""))
        staff_ids = {
            read_id("DISCORD_STAFF_ROLE_IDS", item)
            for item in os.getenv("DISCORD_STAFF_ROLE_IDS", "").split(",") if item.strip()
        }
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    volume = os.getenv("RAILWAY_VOLUME_MOUNT_PATH")
    db_path = os.getenv("EXCURSION_DB_PATH") or (
        str(Path(volume) / "excursions.sqlite3") if volume else "data/excursions.sqlite3"
    )
    store = Store(db_path)
    try:
        bot = ExcursionBot(guild_id, warning_id, staff_ids, store)
        bot.run(token, log_handler=None)
    finally:
        store.close()


if __name__ == "__main__":
    main()
