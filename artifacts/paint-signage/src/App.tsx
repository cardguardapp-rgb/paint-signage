import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Shell } from "@/components/shell";

import Dashboard from "@/pages/dashboard";
import Jobs from "@/pages/jobs";
import JobNew from "@/pages/job-new";
import JobDetail from "@/pages/job-detail";
import Clients from "@/pages/clients";
import ClientDetail from "@/pages/client-detail";
import NewClient from "@/pages/client-new";
import Users from "@/pages/users";

const queryClient = new QueryClient();

function Router() {
  return (
    <Shell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/jobs/new" component={JobNew} />
        <Route path="/jobs/:id" component={JobDetail} />
        <Route path="/jobs" component={Jobs} />
        <Route path="/clients/new" component={NewClient} />
        <Route path="/clients/:id" component={ClientDetail} />
        <Route path="/clients" component={Clients} />
        <Route path="/users" component={Users} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
