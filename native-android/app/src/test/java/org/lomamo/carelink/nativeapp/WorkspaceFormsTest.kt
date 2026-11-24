package org.lomamo.carelink.nativeapp
import org.junit.Assert.*
import org.junit.Test

class WorkspaceFormsTest {
    @Test fun allSchemasHaveFieldsAndLimitations() {
        assertEquals(12, WorkspaceForms.definitions.size)
        WorkspaceForms.definitions.values.forEach {
            assertTrue(it.fields.isNotEmpty()); assertTrue(it.workflowNote.isNotBlank())
            assertNotNull(WorkspaceForms.validate(it, emptyList()))
            assertNotNull(WorkspaceForms.validate(it, it.fields.map { " " }))
            assertNotNull(WorkspaceForms.validate(it, it.fields.map { "x".repeat(501) }))
        }
    }
    @Test fun financeRejectsInvalidAmounts() {
        val form = WorkspaceForms.definitions.getValue("Finance & costing")
        assertNull(WorkspaceForms.validate(form, listOf("Test", "Test", "125.50", "Test")))
        listOf("-1", "NaN", "Infinity", "abc").forEach { amount ->
            assertNotNull(WorkspaceForms.validate(form, listOf("Test", "Test", amount, "Test")))
        }
    }
    @Test fun requisitionsRequirePositiveWholeQuantities() {
        val form = WorkspaceForms.definitions.getValue("Inventory & procurement")
        listOf("0", "-1", "1.5", "ten").forEach { qty ->
            assertNotNull(WorkspaceForms.validate(form, listOf("Sample", qty, "Unit", "Test", "Test")))
        }
        assertNull(WorkspaceForms.validate(form, listOf("Sample", "2", "Unit", "Test", "Test")))
    }
}
