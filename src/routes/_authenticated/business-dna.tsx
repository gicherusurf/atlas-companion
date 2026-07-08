import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { businessService } from "@/lib/business-service";
import { BusinessHeader } from "@/components/business/BusinessHeader";
import { BusinessForm } from "@/components/business/BusinessForm";
import { ProductsTable } from "@/components/business/ProductsTable";
import { MarketsTable } from "@/components/business/MarketsTable";
import { CompetitorsTable } from "@/components/business/CompetitorsTable";
import { Card, CardContent } from "@/components/ui/card";
import type {
  BusinessProfileInput,
  ProductInput,
  MarketInput,
  BusinessCompetitorInput,
} from "@/types/business";

export const Route = createFileRoute("/_authenticated/business-dna")({
  component: BusinessDna,
});

// TODO(multi-business): an organization can own multiple businesses. Once
// business switching UI exists, this should come from selected-business
// context/state (e.g. a BusinessProvider or router search param) instead
// of a hardcoded placeholder. Every call below is already scoped by
// businessId so wiring in real switching later only touches this one spot.
const CURRENT_BUSINESS_ID = "current-business";

function BusinessDna() {
  const queryClient = useQueryClient();
  const businessId = CURRENT_BUSINESS_ID;

  const profileQuery = useQuery({
    queryKey: ["business", businessId, "profile"],
    queryFn: () => businessService.getBusiness(businessId),
  });

  const productsQuery = useQuery({
    queryKey: ["business", businessId, "products"],
    queryFn: () => businessService.listProducts(businessId),
  });

  const marketsQuery = useQuery({
    queryKey: ["business", businessId, "markets"],
    queryFn: () => businessService.listMarkets(businessId),
  });

  const competitorsQuery = useQuery({
    queryKey: ["business", businessId, "competitors"],
    queryFn: () => businessService.listCompetitors(businessId),
  });

  // NOTE: using plain async handlers + manual invalidation rather than
  // useMutation, to keep this readable while BusinessService is still a
  // TODO stub. Once Supabase is wired, these are natural candidates for
  // useMutation with optimistic updates.

  async function handleSaveProfile(input: BusinessProfileInput) {
    await businessService.updateBusiness(businessId, input);
    queryClient.invalidateQueries({ queryKey: ["business", businessId, "profile"] });
  }

  async function handleAddProduct(input: ProductInput) {
    await businessService.createProduct(businessId, input);
    queryClient.invalidateQueries({ queryKey: ["business", businessId, "products"] });
  }
  async function handleEditProduct(id: string, input: ProductInput) {
    await businessService.updateProduct(businessId, id, input);
    queryClient.invalidateQueries({ queryKey: ["business", businessId, "products"] });
  }
  async function handleDeleteProduct(id: string) {
    await businessService.deleteProduct(businessId, id);
    queryClient.invalidateQueries({ queryKey: ["business", businessId, "products"] });
  }

  async function handleAddMarket(input: MarketInput) {
    await businessService.createMarket(businessId, input);
    queryClient.invalidateQueries({ queryKey: ["business", businessId, "markets"] });
  }
  async function handleEditMarket(id: string, input: MarketInput) {
    await businessService.updateMarket(businessId, id, input);
    queryClient.invalidateQueries({ queryKey: ["business", businessId, "markets"] });
  }
  async function handleDeleteMarket(id: string) {
    await businessService.deleteMarket(businessId, id);
    queryClient.invalidateQueries({ queryKey: ["business", businessId, "markets"] });
  }

  async function handleAddCompetitor(input: BusinessCompetitorInput) {
    await businessService.createCompetitor(businessId, input);
    queryClient.invalidateQueries({ queryKey: ["business", businessId, "competitors"] });
  }
  async function handleEditCompetitor(id: string, input: BusinessCompetitorInput) {
    await businessService.updateCompetitor(businessId, id, input);
    queryClient.invalidateQueries({ queryKey: ["business", businessId, "competitors"] });
  }
  async function handleDeleteCompetitor(id: string) {
    await businessService.deleteCompetitor(businessId, id);
    queryClient.invalidateQueries({ queryKey: ["business", businessId, "competitors"] });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <BusinessHeader companyName={profileQuery.data?.companyName} />

      <BusinessForm profile={profileQuery.data} onSave={handleSaveProfile} />

      <Card>
        <CardContent className="pt-6">
          <ProductsTable
            products={productsQuery.data ?? []}
            isLoading={productsQuery.isLoading}
            onAdd={handleAddProduct}
            onEdit={handleEditProduct}
            onDelete={handleDeleteProduct}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <MarketsTable
            markets={marketsQuery.data ?? []}
            isLoading={marketsQuery.isLoading}
            onAdd={handleAddMarket}
            onEdit={handleEditMarket}
            onDelete={handleDeleteMarket}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <CompetitorsTable
            competitors={competitorsQuery.data ?? []}
            isLoading={competitorsQuery.isLoading}
            onAdd={handleAddCompetitor}
            onEdit={handleEditCompetitor}
            onDelete={handleDeleteCompetitor}
          />
        </CardContent>
      </Card>
    </div>
  );
}
