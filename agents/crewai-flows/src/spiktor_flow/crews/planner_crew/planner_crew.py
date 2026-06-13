from crewai import Agent, Crew, Process, Task
from crewai.project import CrewBase, agent, crew, task

from spiktor_flow.tools import (
    SubconsciousWhisperTool,
    JesusCheckTool,
    MemorySearchTool,
)


@CrewBase
class PlannerCrew:
    """spiktor-planner — breaks tasks into verifiable steps. Left brain (analytical)."""

    agents_config = "config/agents.yaml"
    tasks_config  = "config/tasks.yaml"

    @agent
    def spiktor_planner(self) -> Agent:
        return Agent(
            config=self.agents_config["spiktor_planner"],
            tools=[SubconsciousWhisperTool(), JesusCheckTool(), MemorySearchTool()],
            verbose=True,
        )

    @task
    def plan_task(self) -> Task:
        return Task(config=self.tasks_config["plan_task"])

    @crew
    def crew(self) -> Crew:
        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.sequential,
            verbose=True,
        )
