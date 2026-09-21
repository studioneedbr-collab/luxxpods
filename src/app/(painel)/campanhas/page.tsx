import { Megaphone } from "lucide-react";
import { EmBreve } from "@/components/em-breve";

export default function CampanhasPage() {
  return (
    <EmBreve
      titulo="Campanhas"
      descricao="Origem e performance de aquisição por campanha, para saber de onde vem cada lead e quanto cada canal fatura."
      icone={Megaphone}
      entrega="Versão 3"
      pronto={["Campo campanha na tabela leads", "Origem e canal registrados em cada conversa"]}
      itens={["Cadastro de campanhas com UTM", "Atribuição de lead à campanha de origem", "Custo por lead e retorno por campanha", "Disparo segmentado dentro das regras do canal"]}
    />
  );
}
