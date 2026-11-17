from datetime import date, timedelta
from types import SimpleNamespace
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch

import discord

from bot import (
    ApplicationForm, DmReturn, ExcursionBot, PanelView, ReturnCalendar, ReturnDateSelect,
    StaffList, list_excursions, member_return,
)
from excursions import Store, scan_overdue


class DiscordUiTests(IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.store = Store(":memory:")
        self.addCleanup(self.store.close)
        self.bot = ExcursionBot(1, 3, {4}, self.store)
        await self.bot.__aenter__()
        self.addAsyncCleanup(self.bot.__aexit__, None, None, None)

    def interaction(self, user_id=2, guild_id=1, client=None):
        return SimpleNamespace(
            client=client if client is not None else self.bot,
            guild_id=guild_id,
            user=SimpleNamespace(id=user_id),
            response=SimpleNamespace(send_message=AsyncMock(), send_modal=AsyncMock(), edit_message=AsyncMock()),
        )

    async def test_guild_command_definitions_and_button_registration(self):
        self.bot.tree.sync = AsyncMock(return_value=[1, 2])
        await self.bot.setup_hook()
        self.assertEqual(
            {command.name for command in self.bot.tree.get_commands(guild=discord.Object(id=1))},
            {"외출안내", "외출인원"},
        )
        self.assertEqual(self.bot.tree.get_commands(), [])
        self.assertTrue(PanelView().is_persistent())
        self.assertEqual([item.label for item in PanelView().children], ["외출 신청", "복귀"])
        self.assertEqual(DmReturn(123).custom_id, "h2nr:excursion:dm-return:123")
        self.assertEqual([item.custom_id for item in PanelView().children],
                         ["h2nr:excursion:apply", "h2nr:excursion:return"])
        self.assertEqual(len(ApplicationForm(date(2026, 11, 18)).to_dict()["components"]), 1)

    async def test_panel_opens_ephemeral_calendar_and_selects_date(self):
        today = date(2026, 11, 18)
        first = self.interaction()
        with patch("bot.korea_today", return_value=today):
            await PanelView().apply.callback(first)
        args = first.response.send_message.await_args.kwargs
        self.assertTrue(args["ephemeral"])
        self.assertIn("11월", args["embed"].title)
        self.assertIn("[18]", args["embed"].description)
        self.assertNotIn("[17]", args["embed"].description)
        view = args["view"]
        self.assertTrue(view.previous.disabled)
        self.assertFalse(await view.interaction_check(self.interaction(user_id=6)))
        self.assertFalse(await view.interaction_check(self.interaction(guild_id=7)))
        self.assertTrue(await view.interaction_check(self.interaction()))

        into_next = self.interaction()
        await view.next.callback(into_next)
        edited = into_next.response.edit_message.await_args.kwargs
        self.assertIn("12월", edited["embed"].title)
        view = edited["view"]
        self.assertTrue(view.next.disabled)
        self.assertFalse(view.previous.disabled)
        back_to_first = self.interaction()
        await view.previous.callback(back_to_first)
        self.assertIn("11월", back_to_first.response.edit_message.await_args.kwargs["embed"].title)

        select = next(item for item in view.children if isinstance(item, ReturnDateSelect))
        self.assertEqual(select.options[-1].value, "2026-12-18")
        self.assertEqual(select.options[0].label, "12월 1일 (화)")
        select._values = [select.options[-1].value]
        on_select = self.interaction()
        with patch("bot.korea_today", return_value=today):
            await select.callback(on_select)
        modal = on_select.response.send_modal.await_args.args[0]
        self.assertIn("12월 18일 복귀", modal.title)
        self.assertEqual(len(modal.children), 1)
        modal.reason._value = "개인 일정"
        with patch("bot.korea_today", return_value=today):
            await modal.on_submit(self.interaction())
        record = self.store.open(1)[0]
        self.assertEqual((record.start_date, record.due_date, record.reason),
                         ("2026-11-18", "2026-12-18", "개인 일정"))

    async def test_calendar_all_and_only_valid_dates(self):
        for today, month_end in (
            (date(2026, 1, 1), date(2026, 2, 1)),
            (date(2028, 1, 31), date(2028, 2, 29)),
            (date(2026, 12, 20), date(2027, 1, 20)),
        ):
            with self.subTest(today=today):
                offered = []
                for month in (today, month_end):
                    view = ReturnCalendar(2, today, month)
                    for row in view.to_components()[1:]:
                        options = row["components"][0]["options"]
                        self.assertTrue(1 <= len(options) <= 25)
                        offered.extend(option["value"] for option in options)
                expected = [
                    (today + timedelta(days=offset)).isoformat()
                    for offset in range((month_end - today).days + 1)
                ]
                self.assertEqual(offered, expected)

    async def test_calendar_rejects_past_date_click_or_submission_after_midnight(self):
        today = date(2026, 11, 18)
        view = ReturnCalendar(2, today)
        select = next(item for item in view.children if isinstance(item, ReturnDateSelect))
        select._values = [today.isoformat()]
        tomorrow = today + timedelta(days=1)
        interaction = self.interaction()
        with patch("bot.korea_today", return_value=tomorrow):
            await select.callback(interaction)
            interaction.response.send_modal.assert_not_awaited()
            interaction.response.send_message.assert_awaited_once()

            modal = ApplicationForm(today)
            modal.reason._value = "테스트"
            interaction = self.interaction()
            await modal.on_submit(interaction)
            interaction.response.send_message.assert_awaited_once()
        self.assertEqual(self.store.open(1), [])

    async def test_staff_list_denies_other_users_and_replies_privately(self):
        rejected = self.interaction()
        await list_excursions.callback(rejected)
        rejected.response.send_message.assert_awaited_once()
        self.assertTrue(rejected.response.send_message.await_args.kwargs["ephemeral"])

        first = date(2026, 11, 17)
        self.store.apply(1, 2, first, first, "@everyone **개인 일정**")
        authorized = self.interaction(client=SimpleNamespace(is_staff=lambda interaction: True, store=self.store, guild_id=1))
        await list_excursions.callback(authorized)
        kwargs = authorized.response.send_message.await_args.kwargs
        self.assertTrue(kwargs["ephemeral"])
        self.assertFalse(kwargs["allowed_mentions"].everyone)
        self.assertIn("개인 일정", kwargs["embed"].fields[0].value)

    async def test_dm_button_only_returns_owner_and_panel_blocks_other_guilds(self):
        first = date(2026, 11, 17)
        self.store.apply(1, 2, first, first, "일정")
        row = self.store.open(1)[0]
        await DmReturn(row.id).callback(self.interaction(user_id=9, guild_id=None))
        await member_return(self.interaction(guild_id=7))
        self.assertEqual(len(self.store.open(1)), 1)
        await DmReturn(row.id).callback(self.interaction(guild_id=None))
        self.assertEqual(self.store.open(1), [])

    async def test_staff_paging(self):
        day = date(2026, 11, 17)
        for uid in range(20, 31):
            self.store.apply(1, uid, day, day, "개인 일정")
        view = StaffList(self.store.open(1), 2)
        self.assertEqual(len(view.render(0).fields), 8)
        self.assertTrue(view.previous.disabled)
        self.assertEqual(len(view.render(1).fields), 3)
        self.assertTrue(view.next.disabled)

    async def test_outbound_notice_has_working_button_and_no_reason_leak(self):
        day = date(2026, 11, 17)
        self.store.apply(1, 2, day, day, "이유 비공개")
        user = SimpleNamespace(display_name="새벽", send=AsyncMock())
        self.bot.fetch_user = AsyncMock(return_value=user)
        channel = SimpleNamespace(send=AsyncMock(return_value=SimpleNamespace(id=505)))
        self.bot.warning_channel = AsyncMock(return_value=channel)
        await scan_overdue(self.store, 1, self.bot, lambda: date(2026, 11, 18))
        dm = user.send.await_args
        self.assertIn("새벽님! 아직 복귀를 하지 않으셨네요!", dm.args[0])
        self.assertNotIn("이유 비공개", dm.args[0])
        self.assertIsInstance(dm.kwargs["view"].children[0], DmReturn)
        warning = channel.send.await_args
        self.assertIn("외출 미복귀", warning.args[0])
        self.assertNotIn("이유 비공개", warning.args[0])
        self.assertFalse(warning.kwargs["allowed_mentions"].users)
        self.assertEqual(self.store.open(1)[0].warning_message_id, "505")
