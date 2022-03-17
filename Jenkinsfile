pipeline {
	agent any
	parameters {
        string(name: 'Greeting', defaultValue: 'Hello', description: 'How should I greet the world?')
    }
	environment {
		buildFile = 'Dockerfile'
	}
	stages {
		stage('show ID') {
			steps {
				dir('.') {
					sh 'id'
				}
			}
		}
	}
}
