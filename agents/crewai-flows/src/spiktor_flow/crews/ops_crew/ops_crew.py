from crewai import Agent, Crew, Process, Task
from crewai.project import CrewBase, agent, crew, task

from spiktor_flow.tools import (
    SubconsciousWhisperTool,
    JesusCheckTool,
    MemoryStoreTool,
    GitHubCreateBranchTool,
    GitHubPushFilesTool,
    GitHubCreatePRTool,
    GitHubWorkflowRunsTool,
    SWDVerifyTool,
)


@CrewBase
class OpsCrew:
    """spiktor-ops — executes SHIP decisions. Left brain (execution)."""

    agents_config = "config/agents.yaml"
    tasks_config  = "config/tasks.yaml"

    @agent
    def spiktor_ops(self) -> Agent:
        return Agent(
            config=self.agents_config["spiktor_ops"],
            tools=[
                SubconsciousWhisperTool(),
                JesusCheckTool(),
                MemoryStoreTool(),
                GitHubCreateBranchTool(),
                GitHubPushFilesTool(),
                GitHubCreatePRTool(),
                GitHubWorkflowRunsTool(),
                SWDVerifyTool(),
            ],
            verbose=True,
        )

    @task
    def execute_ship(self) -> Task:
        return Task(config=self.tasks_config["execute_ship"])

    @crew
    def crew(self) -> Crew:
        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.sequential,
            verbose=True,
        )
