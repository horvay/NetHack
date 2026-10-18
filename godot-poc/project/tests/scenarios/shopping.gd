extends Scenario
## Shopping in a real tended general store (bridge fixture: the hero stands
## by the shopkeeper with 2000 gold and an unpaid food ration and potion):
##   1. unpaid items show their price, and the action bar offers to pay;
##   2. paying opens the bill with prices and a running total (with
##      menustyle:traditional NetHack first asks "Itemized billing?", answered
##      here with the plain-language "Choose from a list");
##   3. pay for only the food ration: it becomes ours, the potion stays unpaid;
##   4. dropping the dagger brings an offer that reads "Sell / Don't sell";
##      declining leaves it ours, on the shop floor.

const SHOP := {"NH_SHIM_TEST_SHOP_PAYMENT_SCENE": "sufficient"}


func run() -> void:
	await start_fixture("Brunhild-Val-Hum-Fem-Law", "", SHOP)
	await press(KEY_ESCAPE)
	await settle_camera()
	var ration := _item("food ration", true)
	expect(ItemText.price(ration) > 0, "the unpaid food ration shows a price (%s)" % ration.get("text", ""))
	var pay: Button = await _context_button("Pay the shopkeeper")
	if not expect(pay != null, "the action bar offers to pay the shopkeeper"):
		await screenshot("no-pay-button")
		return
	expect(pay.text.contains("zm"), "the pay action shows the bill (%s)" % pay.text)
	await screenshot("in-the-shop")

	await click_control(pay)
	var question := await _wait_dialog(QuestionDialog) as QuestionDialog
	if question and question.choices.has("m"):
		await screenshot("itemized-billing")
		var list_button := _button_in(question, "Choose from a list")
		expect(list_button != null, "billing offers 'Choose from a list'")
		await click_control(list_button)
	var bill := await _wait_dialog(MenuDialog) as MenuDialog
	if not expect(bill != null and bill.paying, "the bill opened as a pay screen"):
		await screenshot("no-bill")
		return
	var food_row: ItemRow = null
	for row in bill.rows:
		expect(ItemText.price(row.item) > 0, "bill row has a price: %s" % row.item.get("text", ""))
		if str(row.item.get("text", "")).contains("food ration"):
			food_row = row
	expect(bill._summary.text.begins_with("Paying 0 of"), "the bill starts with nothing chosen (%s)" % bill._summary.text)
	await click_control(food_row)
	expect(not bill._summary.text.begins_with("Paying 0 "), "choosing the ration updates the total (%s)" % bill._summary.text)
	await screenshot("bill")
	await click_control(_button_in(bill, "Pay"))
	await wait_for_command_prompt()
	await get_tree().create_timer(0.3).timeout
	expect(_item("food ration", true).is_empty(), "the food ration is paid for")
	expect(not _item("potion", true).is_empty(), "the potion is still on the bill")
	await screenshot("after-paying")

	# Offer the dagger for sale, then keep it.
	var dagger := _item("dagger")
	await type_text("d")
	var picker := await _wait_dialog(QuestionDialog) as QuestionDialog
	expect(picker != null, "drop asks which item")
	await type_text(char(int(dagger.get("selector", 0))))
	var offer := await _wait_dialog(QuestionDialog) as QuestionDialog
	if expect(offer != null and str(offer.request.get("query", "")).contains("Sell it?"), "the shopkeeper offers to buy the dagger"):
		var keep := _button_in(offer, "Don't sell")
		expect(_button_in(offer, "Sell") != null and keep != null, "the offer reads Sell / Don't sell")
		await screenshot("sell-offer")
		await click_control(keep)
	await wait_for_command_prompt()
	await get_tree().create_timer(0.3).timeout
	await screenshot("kept-dagger")


func _item(word: String, unpaid := false) -> Dictionary:
	for item in game.state.inventory:
		var text := ItemText.display_name(item)
		if text.contains(word) and (not unpaid or text.contains("unpaid")):
			return item
	return {}


func _context_button(label: String) -> Button:
	for i in 60:
		for child in game.hud.action_bar._context_box.get_children():
			if child is Button and str(child.text).begins_with(label) and not child.is_queued_for_deletion():
				await get_tree().create_timer(0.3).timeout
				return child
		await get_tree().process_frame
	return null


func _wait_dialog(type: Variant) -> Control:
	var deadline := Time.get_ticks_msec() + 10000
	while Time.get_ticks_msec() < deadline:
		var active: Control = game.dialogs.active if game.dialogs.owns_input() else null
		if active and is_instance_of(active, type):
			await get_tree().create_timer(0.35).timeout
			return active
		await get_tree().process_frame
	return null


func _button_in(root: Node, label: String) -> Button:
	for node in root.find_children("*", "Button", true, false):
		if node is Button and not (node is ItemRow) and str(node.text).begins_with(label):
			return node
	return null
