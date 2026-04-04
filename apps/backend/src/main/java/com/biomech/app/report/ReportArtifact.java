package com.biomech.app.report;

import com.biomech.app.common.BaseEntity;
import com.biomech.app.session.Session;
import jakarta.persistence.*;

@Entity
@Table(name = "report_artifacts")
public class ReportArtifact extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", nullable = false)
    private Session session;

    @Column(nullable = false)
    private String reportType;

    @Column(nullable = false)
    private String filePath;

    @Column(nullable = false)
    private String mimeType;

    private boolean includesInferredMotion;
    private String notes;

    public Session getSession() { return session; }
    public void setSession(Session session) { this.session = session; }
    public String getReportType() { return reportType; }
    public void setReportType(String reportType) { this.reportType = reportType; }
    public String getFilePath() { return filePath; }
    public void setFilePath(String filePath) { this.filePath = filePath; }
    public String getMimeType() { return mimeType; }
    public void setMimeType(String mimeType) { this.mimeType = mimeType; }
    public boolean isIncludesInferredMotion() { return includesInferredMotion; }
    public void setIncludesInferredMotion(boolean includesInferredMotion) { this.includesInferredMotion = includesInferredMotion; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}
