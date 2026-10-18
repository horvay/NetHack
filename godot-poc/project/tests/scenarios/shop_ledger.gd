extends Scenario
## NetHack's shop lists are a ledger (ShopLedgerScreen), in a real tended
## shop (bridge fixture: 2000 gold, an unpaid food ration and potion):
##   1. the inventory shows "Your bill" with the amount owed;
##   2. it opens NetHack's bill (Iu) as the ledger: each unpaid item with
##      its art and price, NetHack's total against the hero's gold;
##   3. Pay (p) goes on to NetHack's paying.

const SHOP := {"NH_SHIM_TEST_SHOP_PAYMENT_SCENE": "sufficient"}


func run() -> void:
	await start_fixture("Brunhild-Val-Hum-Fem-Law", "", SHOP)
	await press(KEY_ESCAPE)
	await type_text("i")
	await get_tree().create_timer(0.6).timeout
	var bill: Button = game.dialogs.active.find_child("BillButton", true, false) if game.dialogs.active else null
	if not expect(bill != null and bill.visible and bill.text.contains("zm"), "the inventory shows the bill (%s)" % (bill.text if bill else "none")):
		await screenshot("no-bill")
		return
	await screenshot("inventory-bill")
	mark()
	await click_control(bill)
	var deadline := Time.get_ticks_msec() + 6000
	while Time.get_ticks_msec() < deadline and not game.dialogs.active is ShopLedgerScreen:
		await get_tree().process_frame
	var ledger := game.dialogs.active as ShopLedgerScreen
	if not expect(ledger != null and ledger.kind == "bill", "the bill opens as the ledger (%s)" % game.dialogs.active):
		await screenshot("no-ledger")
		return
	await get_tree().create_timer(0.5).timeout
	var rows: Array = []
	for g in ledger.groups:
		rows.append_array(g.rows)
	note("bill: %s  ·  total %d" % [rows, ledger.total])
	expect(rows.size() >= 2 and rows.all(func(r: Dictionary) -> bool: return int(r.price) > 0), "each unpaid item with its price (%d)" % rows.size())
	expect(ledger.total > 0 and ledger.total == rows.reduce(func(a: int, r: Dictionary) -> int: return a + int(r.price), 0), "NetHack's total, the sum of the prices (%d)" % ledger.total)
	var art := ledger.find_children("*", "TextureRect", true, false).filter(func(t: TextureRect) -> bool: return t.texture != null)
	expect(art.size() >= rows.size(), "each row has its item's art (%d)" % art.size())
	await screenshot("ledger")
	mark()
	await type_text("p")
	await wait_for_event(func(e: Dictionary) -> bool: return str(e.get("name", "")) == "shim_select_menu" or (str(e.get("name", "")) == "shim_yn_function" and e.get("lifecycle") == "opened"), "NetHack's paying")
	await get_tree().create_timer(0.4).timeout
	expect(not game.dialogs.active is ShopLedgerScreen, "Pay goes on to NetHack's paying (%s)" % game.dialogs.active)
	await screenshot("paying")
	for i in 4:
		if game.state.is_waiting_for_command() and game.dialogs.active == null:
			break
		await press(KEY_ESCAPE)
		await get_tree().create_timer(0.3).timeout
