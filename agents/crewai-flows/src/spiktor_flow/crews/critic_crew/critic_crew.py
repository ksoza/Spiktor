from crewai import Agent, Crew, Process, Task
from crewai.project import CrewBase, agent, crew, task

from spiktor_flow.tools import (
    SubconsciousWhisperTool,
    JesusCheckTool,
    GitHubGetFileTool,
)


@CrewBase
class CriticCrew:
    """spiktor-critic — reviews coder output. Left brain (evaluation)."""

    agents_config = "config/agents.yaml"
    tasks_config  = "config/tasks.yaml"

    @agent
    def spiktor_critic(self) -> Agent:
        return Agent(
            config=self.agents_config["spiktor_critic"],
            tools=[SubconsciousWhisperTool(), JesusCheckTool(), GitHubGetFileTool()],
            verbose=True,
        )

    @task
    def review_step(self) -> Task:
        return Task(config=self.tasks_config["review_step"])

    @crew
    def crew(self) -> Crew:
        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.sequential,
            verbose=True,
        )
