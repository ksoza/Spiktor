from crewai import Agent, Crew, Process, Task
from crewai.project import CrewBase, agent, crew, task

from spiktor_flow.tools import (
    SubconsciousWhisperTool,
    JesusCheckTool,
    MemoryStoreTool,
    MemorySearchTool,
    GitHubGetFileTool,
    SWDVerifyTool,
)


@CrewBase
class CoderCrew:
    """spiktor-coder — implements steps with SWD verification. Left brain (sequential)."""

    agents_config = "config/agents.yaml"
    tasks_config  = "config/tasks.yaml"

    @agent
    def spiktor_coder(self) -> Agent:
        return Agent(
            config=self.agents_config["spiktor_coder"],
            tools=[
                SubconsciousWhisperTool(),
                JesusCheckTool(),
                MemoryStoreTool(),
                MemorySearchTool(),
                GitHubGetFileTool(),
                SWDVerifyTool(),
            ],
            verbose=True,
        )

    @task
    def implement_step(self) -> Task:
        return Task(config=self.tasks_config["implement_step"])

    @crew
    def crew(self) -> Crew:
        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.sequential,
            verbose=True,
        )
