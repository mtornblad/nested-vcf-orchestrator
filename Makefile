.PHONY: validate test package push clean pull download

PYTHON ?= python3
MAVEN ?= mvn
MAVEN_FLAGS ?= --batch-mode --no-transfer-progress

validate:
	$(PYTHON) scripts/validate_project.py
	$(PYTHON) scripts/generate_modular_form.py --check

test: validate
	$(MAVEN) $(MAVEN_FLAGS) test

package: validate
	$(MAVEN) $(MAVEN_FLAGS) clean package

push: validate
	@test -n "$(PROFILE)" || { echo "PROFILE is required, for example: make push PROFILE=lab" >&2; exit 2; }
	$(PYTHON) scripts/validate_project.py --profile "$(PROFILE)"
	$(MAVEN) $(MAVEN_FLAGS) clean package vrealize:push -P$(PROFILE)

clean:
	$(MAVEN) $(MAVEN_FLAGS) clean

pull download:
	@echo "TypeScript pull is unsupported: vRO JavaScript cannot be converted back to this TypeScript source. Use Git to retrieve source changes." >&2
	@exit 2
