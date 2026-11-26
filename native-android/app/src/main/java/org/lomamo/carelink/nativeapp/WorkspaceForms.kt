package org.lomamo.carelink.nativeapp

/** Preview data entry only: these schemas do not substitute for validated clinical rules. */
data class WorkspaceForm(val fields: List<String>, val workflowNote: String)
object WorkspaceForms {
    val definitions = linkedMapOf(
        "Assessments & Omaha care plans" to WorkspaceForm(listOf("Sample patient reference", "Assessment summary", "Care goal", "Planned intervention", "Review date"), "Draft documentation only. Clinical scoring, decision support and approved assessment forms are not implemented."),
        "Referrals & discharge" to WorkspaceForm(listOf("Sample patient reference", "Referral or discharge", "Destination", "Reason", "Follow-up plan"), "Draft only; no referral is sent and no patient status is changed."),
        "TB & pharmacy" to WorkspaceForm(listOf("Sample patient reference", "Medicine reference", "Requested quantity", "Review note"), "Training request only. No prescribing, dose calculation, dispensing or stock deduction."),
        "Households" to WorkspaceForm(listOf("Fictional household reference", "Area", "Support needs", "Planned follow-up"), "Sample household coordination; no personal identities or addresses."),
        "Scheduling" to WorkspaceForm(listOf("Activity", "Date", "Time", "Assigned team", "Location label"), "Local preview plan; reminders and shared calendars are not connected."),
        "Teams & handovers" to WorkspaceForm(listOf("Team", "Handover summary", "Action owner", "Due date"), "Sample handover; no notification or assignment is sent."),
        "Inventory & procurement" to WorkspaceForm(listOf("Item", "Requested quantity", "Unit", "Reason", "Approver role"), "Draft requisition only; no purchasing, approval or stock ledger transaction."),
        "Staff & leave" to WorkspaceForm(listOf("Fictional staff reference", "Leave type", "Start date", "End date", "Handover plan"), "Sample leave request; no payroll or approval integration."),
        "Finance & costing" to WorkspaceForm(listOf("Cost centre", "Description", "Amount (KES)", "Budget reference"), "Draft costing only; not an accounting ledger or payment instruction."),
        "Governance & board" to WorkspaceForm(listOf("Agenda item", "Decision draft", "Action owner", "Review date"), "Draft minutes only; no board approval or voting."),
        "Documents & media" to WorkspaceForm(listOf("Document title", "Category", "Description"), "Metadata preview only; no files or photos are uploaded."),
        "Meetings & communication" to WorkspaceForm(listOf("Meeting title", "Date", "Agenda", "Team"), "Draft agenda only; calling, messaging and invitations are not connected.")
    )
    fun validate(form: WorkspaceForm, values: List<String>): String? {
        if (values.size != form.fields.size) return "All fields must be supplied"
        if (values.any { it.isBlank() }) return "Complete all fields"
        if (values.any { it.length > 500 }) return "Keep each field under 500 characters"
        form.fields.indexOf("Amount (KES)").takeIf { it >= 0 }?.let { index ->
            val amount = values[index].toBigDecimalOrNull()
            if (amount == null || amount.signum() < 0) return "Enter a valid non-negative amount"
        }
        form.fields.indexOf("Requested quantity").takeIf { it >= 0 }?.let { index ->
            val quantity = values[index].toIntOrNull()
            if (quantity == null || quantity <= 0) return "Quantity must be a positive whole number"
        }
        return null
    }
}
