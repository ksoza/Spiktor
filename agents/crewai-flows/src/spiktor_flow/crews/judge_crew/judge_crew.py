from crewai import Agent, Crew, Process, Task
from crewai.project import CrewBase, agent, crew, task

from spiktor_flow.tools import (
    SubconsciousWhisperTool,
    JesusCheckTool,
    MemoryStoreTool,
)


@CrewBase
class JudgeCrew:
    """spiktor-judge — final SHIP/NO-SHIP authority. Left brain (executive)."""

    agents_config = "config/agents.yaml"
    tasks_config  = "config/tasks.yaml"

    @agent
    def spiktor_judge(self) -> Agent:
        return Agent(
            config=self.agents_config["spiktor_judge"],
            tools=[SubconsciousWhisperTool(), JesusCheckTool(), MemoryStoreTool()],
            verbose=True,
        )

    @task
    def ship_decision(self) -> Task:
        return Task(config=self.tasks_config["ship_decision"])

    @crew
    def crew(self) -> Crew:
        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.sequential,
            verbose=True,
        )
