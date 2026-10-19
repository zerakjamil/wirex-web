from setuptools import find_namespace_packages, setup

setup(
    name="cli-anything-packet-tracer",
    version="1.0.0",
    description="Drive the real Cisco Packet Tracer from an agent through the macOS Accessibility API",
    long_description=(
        "A stateful CLI and REPL that operates the installed Cisco Packet Tracer "
        "application on macOS. Reads and writes run against the live GUI through a "
        "compiled Swift Accessibility helper; feature inventories combine live menus, "
        "the device palette, Config tab pages and the help pages shipped inside the app."
    ),
    author="cli-anything",
    license="MIT",
    python_requires=">=3.10",
    packages=find_namespace_packages(include=["cli_anything.*"]),
    package_data={
        "cli_anything.packet_tracer": [
            "skills/*.md",
            "utils/*.swift",
            "tests/fixtures/*.json",
        ],
    },
    include_package_data=True,
    install_requires=["click>=8.0"],
    entry_points={
        "console_scripts": [
            "cli-anything-packet-tracer=cli_anything.packet_tracer.packet_tracer_cli:main",
        ],
    },
)
