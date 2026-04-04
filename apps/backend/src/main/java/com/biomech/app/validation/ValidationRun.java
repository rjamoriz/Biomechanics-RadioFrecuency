package com.biomech.app.validation;

import com.biomech.app.common.BaseEntity;
import com.biomech.app.session.Session;
import jakarta.persistence.*;

@Entity
@Table(name = "validation_runs")
public class ValidationRun extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", nullable = false)
    private Session session;

    @Column(nullable = false)
    private String referenceType;

    @Column(nullable = false)
    private String referenceFileName;

    @Column(columnDefinition = "jsonb")
    private String comparisonResultsJson;

    @Column(columnDefinition = "jsonb")
    private String errorSummaryJson;

    private String notes;

    public Session getSession() { return session; }
    public void setSession(Session session) { this.session = session; }
    public String getReferenceType() { return referenceType; }
    public void setReferenceType(String referenceType) { this.referenceType = referenceType; }
    public String getReferenceFileName() { return referenceFileName; }
    public void setReferenceFileName(String referenceFileName) { this.referenceFileName = referenceFileName; }
    public String getComparisonResultsJson() { return comparisonResultsJson; }
    public void setComparisonResultsJson(String comparisonResultsJson) { this.comparisonResultsJson = comparisonResultsJson; }
    public String getErrorSummaryJson() { return errorSummaryJson; }
    public void setErrorSummaryJson(String errorSummaryJson) { this.errorSummaryJson = errorSummaryJson; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}
