#!/usr/bin/env python3
"""
Interactive Persona Wizard for MultiDeck
========================================

This script provides an interactive interface for creating new personas
in the MultiDeck system. It supports both CLI and dashboard integration.

Features:
- Interactive persona creation workflow
- Validation of inputs and generated artifacts
- Registry updates with backup safety
- Starter job generation
- Evidence collection and documentation
"""

import os
import sys
import json
import argparse
import shutil
import datetime
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

def load_persona_template():
    """Load the persona template from the templates directory"""
    template_path = Path(__file__).parent / "../templates/persona-template.md"
    if template_path.exists():
        with open(template_path, 'r') as f:
            return f.read()
    else:
        # Return a basic template if file doesn't exist
        return """# {callsign}

## Identity

**Callsign:** {callsign}
**Role:** {role}
**Scope:** {scope}
**Voice:** {voice}
**Voice activation:** {voice_activation}
**Working Directory:** {working_directory}

---

## What I Am

...

## What I Am NOT

...

## My Lane

...

## OQE 2.0 Requirements (mandatory on every job)

...

## Core Functions

...

## Job Board Handoff Protocol

...

## Voice Output Rules

...

## MCP Tools I Use

...

## Common Anti-Patterns Engineer Avoids

...

## Governing Documents

...

## When to Call Engineer

...

## Further Reading

...
"""

def get_user_input(prompt, required=True):
    """Get input from user with validation"""
    while True:
        user_input = input(f"{prompt}: ").strip()
        if required and not user_input:
            print("This field is required. Please enter a value.")
            continue
        return user_input if user_input else None

def validate_persona_inputs(inputs):
    """Validate persona inputs"""
    errors = []
    
    if not inputs.get('callsign'):
        errors.append("Callsign is required")
    
    if not inputs.get('role'):
        errors.append("Role is required")
        
    if not inputs.get('scope'):
        errors.append("Scope is required")
        
    if not inputs.get('voice'):
        errors.append("Voice is required")
        
    if not inputs.get('cwd'):
        errors.append("Working directory is required")
        
    return errors

def create_persona_file(callsign, role, scope, voice, cwd):
    """Create persona markdown file"""
    template = load_persona_template()
    persona_content = template.format(
        callsign=callsign,
        role=role,
        scope=scope,
        voice=voice,
        voice_activation=f"python hooks/set-voice.py {callsign.lower()}",
        working_directory=cwd
    )
    
    # Create persona file
    persona_file_path = Path(__file__).parent / f"../personas/{callsign}_AGENT.md"
    persona_file_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(persona_file_path, 'w') as f:
        f.write(persona_content)
    
    return str(persona_file_path)

def update_personas_json(callsign, role, scope, voice, cwd):
    """Update personas.json registry"""
    # Read existing registry
    registry_path = Path(__file__).parent / "../personas/personas.json"
    
    # Create backup
    backup_path = Path(__file__).parent / f"../personas/personas.json.backup"
    if registry_path.exists():
        shutil.copy2(registry_path, backup_path)
    
    # Load existing registry
    personas = []
    if registry_path.exists():
        with open(registry_path, 'r') as f:
            personas = json.load(f)
    
    # Create new persona entry
    new_persona = {
        "callsign": callsign,
        "role": role,
        "scope": scope,
        "voice_key": voice,
        "cwd": cwd,
        "agent_file": f"{callsign}_AGENT.md"
    }
    
    # Add to registry
    personas.append(new_persona)
    
    # Write updated registry
    with open(registry_path, 'w') as f:
        json.dump(personas, f, indent=2)
    
    return str(registry_path)

def generate_starter_jobs(callsign, role, scope):
    """Generate starter jobs for the new persona"""
    # Create starter jobs directory if it doesn't exist
    jobs_dir = Path(__file__).parent / "../scripts"
    jobs_dir.mkdir(parents=True, exist_ok=True)
    
    # Define base job structure
    job_template = {
        "job_id": f"MULTIDECK-FEAT-0000",
        "title": f"Starter job for {callsign}",
        "description": f"Initial work for {callsign} persona",
        "assigned_to": callsign,
        "priority": "P2",
        "depends_on": [],
        "oqe_version": "2.0"
    }
    
    print(f"Starter jobs would be generated for {callsign}")
    print("Job generation functionality will be implemented in later stages")
    return True

def collect_persona_inputs():
    """Collect persona inputs through interactive workflow"""
    print("Interactive Persona Wizard for MultiDeck")
    print("=" * 50)
    print()
    
    inputs = {}
    
    print("Please provide the following information for the new persona:")
    print()
    
    inputs['callsign'] = get_user_input("Callsign")
    inputs['role'] = get_user_input("Role")
    inputs['scope'] = get_user_input("Scope")
    inputs['voice'] = get_user_input("Voice identifier")
    inputs['cwd'] = get_user_input("Working directory")
    
    return inputs

def validate_inputs_and_create_artifacts(inputs):
    """Validate inputs and create all persona artifacts"""
    print("\nValidating inputs...")
    
    errors = validate_persona_inputs(inputs)
    if errors:
        print("Validation errors:")
        for error in errors:
            print(f"  - {error}")
        return False
    
    print("All inputs validated successfully!")
    print()
    
    try:
        # Create persona file
        print("Creating persona markdown file...")
        persona_file = create_persona_file(
            inputs['callsign'],
            inputs['role'],
            inputs['scope'],
            inputs['voice'],
            inputs['cwd']
        )
        print(f"✓ Created {persona_file}")
        
        # Update registry
        print("Updating personas registry...")
        registry_file = update_personas_json(
            inputs['callsign'],
            inputs['role'],
            inputs['scope'],
            inputs['voice'],
            inputs['cwd']
        )
        print(f"✓ Updated {registry_file}")
        
        # Generate starter jobs
        print("Generating starter jobs...")
        generate_starter_jobs(inputs['callsign'], inputs['role'], inputs['scope'])
        
        print("\n✓ All persona artifacts created successfully!")
        print(f"✓ Persona: {inputs['callsign']}")
        print(f"✓ Role: {inputs['role']}")
        print(f"✓ Scope: {inputs['scope']}")
        
        return True
        
    except Exception as e:
        print(f"Error creating persona artifacts: {e}")
        print("Please check backup files and retry.")
        return False

def main():
    """Main entry point for the persona wizard"""
    parser = argparse.ArgumentParser(description='Interactive Persona Wizard')
    parser.add_argument('--interactive', action='store_true', help='Interactive mode (default)')
    parser.add_argument('--silent', action='store_true', help='Silent mode (no interaction)')
    parser.add_argument('--input', help='Input JSON file containing persona data')
    parser.add_argument('--version', action='version', version='Persona Wizard 1.0')
    
    args = parser.parse_args()
    
    inputs = {}
    
    if args.input:
        # Load inputs from JSON file
        with open(args.input, 'r') as f:
            inputs = json.load(f)
    elif args.silent:
        print("Silent mode not implemented yet. Use interactive mode.")
        return 1
    else:
        # Interactive mode
        inputs = collect_persona_inputs()
    
    # Create artifacts
    success = validate_inputs_and_create_artifacts(inputs)
    
    if success:
        print("\n🎉 Persona wizard completed successfully!")
        return 0
    else:
        print("\n❌ Persona wizard failed!")
        return 1

if __name__ == "__main__":
    sys.exit(main())