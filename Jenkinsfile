pipeline {
    agent any

    environment {
        CF_API_TOKEN = credentials('CF_API_TOKEN')
        CF_ACCOUNT_ID = credentials('CF_ACCOUNT_ID')
    }

    stages {
        stage('Run Puppeterr Agent') {
            steps {
                catchError(buildResult: 'SUCCESS', stageResult: 'FAILURE') {
                    timeout(time: 3, unit: 'MINUTES') {
                        bat '''
                        set DISPLAY=:0
                        npm install
                        npx playwright install chromium
                        set CF_API_TOKEN=%CF_API_TOKEN%
                        set CF_ACCOUNT_ID=%CF_ACCOUNT_ID%
                        node agent.js
                        echo done
                        '''
                    }
                }
            }
        }
    }

    post {
        aborted {
            echo "Timeout aborted the build — forcing SUCCESS."
            script {
                currentBuild.result = 'SUCCESS'
            }
        }
        failure {
            echo "Build failed — forcing SUCCESS."
            script {
                currentBuild.result = 'SUCCESS'
            }
        }
    }
}
