package org.lomamo.carelink.nativeapp

import android.app.Activity
import android.app.AlertDialog
import android.os.Bundle
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.View
import android.widget.*

/** Native Android views only. Preview deliberately has no network or persistent patient storage. */
class MainActivity : Activity() {
    private val ink = Color.rgb(20,45,58)
    private val teal = Color.rgb(23,117,107)
    private lateinit var content: LinearLayout
    private data class Patient(val code: String, val label: String)
    private val patients = mutableListOf(Patient("DEMO-001", "Sample person A"), Patient("DEMO-002", "Sample person B"))
    private val visits = mutableListOf<String>()
    private val drafts = linkedMapOf<String, MutableList<List<String>>>()
    private val modules = linkedMapOf(
        "Clinical care" to listOf("Patients", "Visits", "Assessments & Omaha care plans", "Referrals & discharge", "TB & pharmacy"),
        "Field operations" to listOf("Households", "Scheduling", "Teams & handovers", "Inventory & procurement"),
        "Organisation" to listOf("Staff & leave", "Finance & costing", "Reports & indicators", "Governance & board", "Documents & media", "Meetings & communication"),
        "System" to listOf("Access & roles", "Backup & synchronisation", "Settings")
    )
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        savedInstanceState?.getStringArrayList("patients")?.let { saved ->
            patients.clear(); saved.forEachIndexed { i, name -> patients.add(Patient("DEMO-${i+1}", name)) }
        }
        savedInstanceState?.getStringArrayList("visits")?.let { visits.addAll(it) }
        savedInstanceState?.getString("drafts")?.let { raw ->
            val json = org.json.JSONObject(raw)
            json.keys().forEach { key ->
                val rows = json.getJSONArray(key)
                drafts[key] = (0 until rows.length()).map { i ->
                    val row = rows.getJSONArray(i)
                    (0 until row.length()).map { j -> row.getString(j) }
                }.toMutableList()
            }
        }
        home()
    }
    override fun onSaveInstanceState(outState: Bundle) {
        outState.putStringArrayList("patients", ArrayList(patients.map { it.label }))
        outState.putStringArrayList("visits", ArrayList(visits))
        val json = org.json.JSONObject()
        drafts.forEach { (name, rows) -> json.put(name, org.json.JSONArray(rows.map { org.json.JSONArray(it) })) }
        outState.putString("drafts", json.toString())
        super.onSaveInstanceState(outState)
    }
    private fun dp(n: Int) = (n * resources.displayMetrics.density).toInt()
    private fun text(value: String, size: Float = 16f, bold: Boolean = false) = TextView(this).apply {
        text = value; textSize = size; setTextColor(ink)
        if (bold) setTypeface(null, Typeface.BOLD)
        setPadding(0, dp(6), 0, dp(6))
    }
    private fun screen(title: String, subtitle: String) {
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(Color.rgb(243,246,247)) }
        val header = text("CareLink  /  LOMAMO", 18f, true).apply {
            setTextColor(Color.WHITE); setBackgroundColor(ink); setPadding(dp(24),dp(20),dp(24),dp(20))
        }
        root.addView(header)
        val scroll = ScrollView(this)
        content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(24),dp(16),dp(24),dp(32)) }
        scroll.addView(content); root.addView(scroll); setContentView(root)
        content.addView(text(title, 30f, true)); content.addView(text(subtitle, 14f))
        content.addView(text("NATIVE PREVIEW • Fictional data only • Not connected to live care records", 12f).apply { setTextColor(teal) })
        if (title != "Workspace") action("‹ Workspace") { home() }
    }
    private fun action(label: String, handler: () -> Unit) {
        content.addView(Button(this).apply {
            text = label; isAllCaps = false; setTextColor(teal)
            setOnClickListener { handler() }
        }, LinearLayout.LayoutParams(-1, dp(56)).apply { bottomMargin = dp(6) })
    }
    private fun card(title: String, description: String, handler: () -> Unit) {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setPadding(dp(18),dp(14),dp(18),dp(14))
            background = GradientDrawable().apply { setColor(Color.WHITE); cornerRadius = dp(14).toFloat(); setStroke(dp(1), Color.rgb(222,231,234)) }
            isFocusable = true; isClickable = true; contentDescription = "$title. $description"
            setOnClickListener { handler() }
        }
        box.addView(text(title,18f,true)); box.addView(text(description,14f))
        content.addView(box, LinearLayout.LayoutParams(-1,-2).apply { bottomMargin = dp(12) })
    }
    private fun home() {
        screen("Workspace", "Care, coordination and insight. In one place.")
        card("${patients.size} sample patients  ·  ${visits.size} preview visits", "Explore the native patient and visit workflows") { patientList() }
        modules.forEach { (group, items) ->
            content.addView(text(group.uppercase(),12f,true))
            items.forEach { name -> card(name, if (name == "Patients" || name == "Visits") "Interactive preview  →" else if (WorkspaceForms.definitions.containsKey(name)) "Draft forms preview  →" else "Native migration pending  →") { open(name) } }
        }
    }
    private fun open(name: String) {
        if (WorkspaceForms.definitions.containsKey(name)) { workspaceRecords(name); return }
        if (name == "Reports & indicators") { previewReport(); return }
        when(name) { "Patients" -> patientList(); "Visits" -> visitList(); else -> {
            screen(name, "Included in the full native migration scope")
            content.addView(text("This workflow is not implemented yet. No website is embedded, and no live records are accessed. The existing web system remains unchanged."))
            content.addView(text("Before live use: native forms, permissions, secure storage, backend integration and workflow testing are required."))
        } }
    }
    private fun workspaceRecords(name: String) {
        val form = WorkspaceForms.definitions.getValue(name)
        screen(name, "Fictional drafts • Not a live workflow")
        content.addView(text(form.workflowNote, 14f))
        action("+ Create sample draft") { workspaceEditor(name) }
        val records = drafts[name].orEmpty()
        if (records.isEmpty()) content.addView(text("No sample drafts yet."))
        records.forEachIndexed { index, row ->
            card(row.first(), "Draft ${index + 1} • Tap to review") {
                screen("Draft ${index + 1}", name)
                form.fields.zip(row).forEach { (label, value) ->
                    content.addView(text(label, 12f, true)); content.addView(text(value))
                }
                action("Delete sample draft") {
                    AlertDialog.Builder(this).setMessage("Delete this draft?")
                        .setNegativeButton("Cancel", null).setPositiveButton("Delete") { _, _ ->
                            drafts[name]?.removeAt(index); workspaceRecords(name)
                        }.show()
                }
                action("Back to drafts") { workspaceRecords(name) }
            }
        }
    }
    private fun workspaceEditor(name: String) {
        val form = WorkspaceForms.definitions.getValue(name)
        screen("New sample draft", name)
        content.addView(text("Use fictional details only. All fields are required."))
        val inputs = form.fields.map { label ->
            content.addView(text(label, 14f, true))
            EditText(this).apply {
                hint = label; inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
                filters = arrayOf(android.text.InputFilter.LengthFilter(500))
                minHeight = dp(48); content.addView(this)
            }
        }
        action("Save sample draft") {
            val values = inputs.map { it.text.toString().trim() }
            val error = WorkspaceForms.validate(form, values)
            if (error != null) Toast.makeText(this, error, Toast.LENGTH_LONG).show()
            else {
                drafts.getOrPut(name) { mutableListOf() }.add(values)
                workspaceRecords(name)
            }
        }
        action("Cancel") { workspaceRecords(name) }
    }
    private fun previewReport() {
        screen("Preview activity", "Sample counts only • Not programme indicators")
        content.addView(text("${patients.size} fictional patient records", 20f, true))
        content.addView(text("${visits.size} sample visits", 20f, true))
        drafts.forEach { (name, records) -> content.addView(text("$name: ${records.size} drafts")) }
        content.addView(text("These counts must not be used for clinical, financial or donor reporting."))
    }
    private fun patientList() {
        screen("Patients", "Fictional records for testing the interface")
        action("+ Add sample patient") {
            val input = EditText(this).apply { hint = "Fictional label only"; inputType = 1; filters = arrayOf(android.text.InputFilter.LengthFilter(60)) }
            val dialog = AlertDialog.Builder(this).setTitle("Add fictional patient").setMessage("Do not enter real patient details.").setView(input).setNegativeButton("Cancel",null).setPositiveButton("Add",null).create()
            dialog.setOnShowListener { dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val label = input.text.toString().trim()
                if (label.isEmpty()) input.error = "Enter a fictional label" else {
                    patients.add(Patient("DEMO-${patients.size+1}", label)); dialog.dismiss(); patientList()
                }
            } }; dialog.show()
        }
        patients.forEach { patient -> card(patient.label, patient.code) {
            screen(patient.label, patient.code)
            content.addView(text("Fictional preview record. No clinical history or live identity data."))
            action("Record sample visit") { recordVisit(patient) }
            visits.filter { it.startsWith(patient.code + " ·") }.forEach { content.addView(text(it)) }
        } }
    }
    private fun recordVisit(patient: Patient) {
        val options = arrayOf("Home visit", "Outpatient visit", "Inpatient visit", "Follow-up")
        AlertDialog.Builder(this).setTitle("Sample visit type").setItems(options) { _, index ->
            visits.add("${patient.code} · ${options[index]} · ${java.text.DateFormat.getDateTimeInstance().format(java.util.Date())}")
            visitList()
        }.setNegativeButton("Cancel",null).show()
    }
    private fun visitList() {
        screen("Visits", "Preview activity • Held in memory, not synced")
        action("+ Record visit for sample patient") {
            AlertDialog.Builder(this).setTitle("Select sample patient").setItems(patients.map { it.label }.toTypedArray()) { _, index -> recordVisit(patients[index]) }.show()
        }
        if (visits.isEmpty()) content.addView(text("No sample visits yet."))
        visits.reversed().forEach { content.addView(text(it)) }
        action("Clear preview visits") { AlertDialog.Builder(this).setMessage("Clear all sample visits?").setNegativeButton("Cancel",null).setPositiveButton("Clear") { _, _ -> visits.clear(); visitList() }.show() }
    }
}
