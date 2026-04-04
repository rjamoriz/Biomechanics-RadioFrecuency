package com.biomech.app.protocol;

import com.biomech.app.common.BaseEntity;
import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "protocol_templates")
public class ProtocolTemplate extends BaseEntity {

    @Column(nullable = false)
    private String name;

    private String description;
    private String targetPopulation;

    @OneToMany(mappedBy = "protocol", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("orderIndex ASC")
    private List<ProtocolStage> stages = new ArrayList<>();

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getTargetPopulation() { return targetPopulation; }
    public void setTargetPopulation(String targetPopulation) { this.targetPopulation = targetPopulation; }
    public List<ProtocolStage> getStages() { return stages; }
    public void setStages(List<ProtocolStage> stages) { this.stages = stages; }

    public void addStage(ProtocolStage stage) {
        stages.add(stage);
        stage.setProtocol(this);
    }
}
