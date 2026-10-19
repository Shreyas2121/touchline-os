import { createBrowserRouter, Navigate } from 'react-router'
import { CommandCenterPage } from '../features/dashboard/CommandCenterPage'
import { ConstitutionPage } from '../features/constitution/ConstitutionPage'
import { FinancePage } from '../features/finance/FinancePage'
import { HelpPage } from '../features/help/HelpPage'
import { MatchJournalPage } from '../features/matches/MatchJournalPage'
import { RegistrationPage } from '../features/registration/RegistrationPage'
import { ScoutingPage } from '../features/scouting/ScoutingPage'
import { SeasonsPage } from '../features/seasons/SeasonsPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { SquadPage } from '../features/squad/SquadPage'
import { TacticsPage } from '../features/tactics/TacticsPage'
import { TransfersPage } from '../features/transfers/TransfersPage'
import { RootLayout } from './layout/RootLayout'
import { WorkspaceLayout } from './layout/WorkspaceLayout'
import { MissingCampaignPage } from './pages/MissingCampaignPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { WelcomePage } from './pages/WelcomePage'
import { ChooseClubPage } from '../features/campaigns/ChooseClubPage'

export const appRoutes = [
  {
    element: <RootLayout />,
    children: [
      { index: true, element: <WelcomePage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'help', element: <HelpPage /> },
      { path: 'app', element: <MissingCampaignPage /> },
      {
        path: 'app/:campaignId',
        element: <WorkspaceLayout />,
        children: [
          { index: true, element: <Navigate to="command-center" replace /> },
          { path: 'command-center', element: <CommandCenterPage /> },
          { path: 'choose-club', element: <ChooseClubPage /> },
          { path: 'squad', element: <SquadPage /> },
          { path: 'tactics', element: <TacticsPage /> },
          { path: 'transfers', element: <TransfersPage /> },
          { path: 'finance', element: <FinancePage /> },
          { path: 'registration', element: <RegistrationPage /> },
          { path: 'scouting', element: <ScoutingPage /> },
          { path: 'matches', element: <MatchJournalPage /> },
          { path: 'seasons', element: <SeasonsPage /> },
          { path: 'constitution', element: <ConstitutionPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

export const router = createBrowserRouter(appRoutes)
